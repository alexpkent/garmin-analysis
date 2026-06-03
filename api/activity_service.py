from datetime import date, datetime

from garminconnect import GarminConnectConnectionError

from normalizer import Normalizer

_GARMIN_BLOB = "garmin/activities.json"
_BACKFILL_LIMIT = 20


class ActivityService:
    def __init__(self, blob_store, garmin_client) -> None:
        self._blob_store = blob_store
        self._garmin_client = garmin_client

    def get_activities(self) -> tuple[list, bool]:
        sync_failed = False

        # garmin/activities.json stores pre-normalised activities (post-migration)
        stored: list = self._blob_store.read_json(_GARMIN_BLOB) or []

        # Determine incremental sync start date from normalised start_date field
        if stored:
            after_date = max(
                datetime.strptime(a["start_date"][:10], "%Y-%m-%d").date()
                for a in stored
            )
        else:
            after_date = date(2000, 1, 1)

        try:
            # Fetch new raw activities from Garmin since last known date
            new_raw: list = self._garmin_client.get_activities(after_date)

            # Fetch polylines for new activities
            for act in new_raw:
                act["encoded_route"] = self._garmin_client.get_activity_polyline(
                    act["activityId"]
                )

            # Normalise new activities before merging
            new_normalised = [Normalizer.normalize_garmin(a) for a in new_raw]
            new_ids = {a["id"] for a in new_normalised}

            changed = bool(new_raw)

            # Backfill: fetch polylines for up to 20 stored Garmin activities
            # that lack a polyline.
            backfill = [
                a
                for a in stored
                if a.get("encoded_route") is None
                and a["id"] not in new_ids
                and a.get("source") == "garmin"
                and a.get("route_status") != "unavailable"
            ][:_BACKFILL_LIMIT]

            for act in backfill:
                polyline = self._garmin_client.get_activity_polyline(
                    int(act["id"])
                )
                if polyline is not None:
                    act["encoded_route"] = polyline
                    act["route_status"] = "present"
                    changed = True
                else:
                    act["route_status"] = "unavailable"
                    changed = True

            # Only persist when something actually changed.
            if changed:
                updated = new_normalised + [a for a in stored if a["id"] not in new_ids]
                self._blob_store.write_json(_GARMIN_BLOB, updated)
                stored = updated

        except GarminConnectConnectionError:
            sync_failed = True

        stored.sort(key=lambda a: a["start_date"], reverse=True)
        return stored, sync_failed
