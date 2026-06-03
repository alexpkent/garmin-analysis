from datetime import date, datetime

from garminconnect import GarminConnectConnectionError

from normalizer import Normalizer

_GARMIN_BLOB = "garmin/activities.json"
_STRAVA_BLOB = "strava/activities.json"
_BACKFILL_LIMIT = 20


class ActivityService:
    def __init__(self, blob_store, garmin_client) -> None:
        self._blob_store = blob_store
        self._garmin_client = garmin_client

    def get_activities(self) -> tuple[list, bool]:
        sync_failed = False

        # Read existing garmin activities from blob storage
        garmin_raw: list = self._blob_store.read_json(_GARMIN_BLOB) or []

        # Determine incremental sync start date
        if garmin_raw:
            after_date = max(
                datetime.strptime(a["startTimeGMT"][:10], "%Y-%m-%d").date()
                for a in garmin_raw
            )
        else:
            after_date = date(2000, 1, 1)

        try:
            # Fetch new activities from Garmin since last known date
            new_activities: list = self._garmin_client.get_activities(after_date)

            # Fetch polylines for all new activities
            for act in new_activities:
                act["encoded_route"] = self._garmin_client.get_activity_polyline(
                    act["activityId"]
                )

            # Backfill: fetch polylines for up to 20 existing activities that lack one
            new_ids = {a["activityId"] for a in new_activities}
            backfill = [
                a
                for a in garmin_raw
                if a.get("encoded_route") is None and a["activityId"] not in new_ids
            ][:_BACKFILL_LIMIT]

            for act in backfill:
                act["encoded_route"] = self._garmin_client.get_activity_polyline(
                    act["activityId"]
                )

            # Merge: new activities supersede existing ones with the same ID
            updated_garmin = new_activities + [
                a for a in garmin_raw if a["activityId"] not in new_ids
            ]
            self._blob_store.write_json(_GARMIN_BLOB, updated_garmin)
            garmin_raw = updated_garmin

        except GarminConnectConnectionError:
            sync_failed = True

        # Read strava activities (read-only — never written)
        strava_raw: list = self._blob_store.read_json(_STRAVA_BLOB) or []

        # Normalize and merge all activities
        normalized = [Normalizer.normalize_strava(a) for a in strava_raw] + [
            Normalizer.normalize_garmin(a) for a in garmin_raw
        ]

        # Deduplicate by (source, id)
        seen: set = set()
        unique: list = []
        for act in normalized:
            key = (act["source"], act["id"])
            if key not in seen:
                seen.add(key)
                unique.append(act)

        # Sort descending by start_date (ISO 8601 strings sort lexicographically)
        unique.sort(key=lambda a: a["start_date"], reverse=True)

        return unique, sync_failed
