from datetime import date, datetime

from garminconnect import GarminConnectConnectionError

from normalizer import Normalizer

_GARMIN_BLOB = "garmin/activities.json"
_HEALTH_BLOB = "garmin/health.json"


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

            # Only persist when something actually changed.
            if changed:
                updated = new_normalised + [a for a in stored if a["id"] not in new_ids]
                self._blob_store.write_json(_GARMIN_BLOB, updated)
                stored = updated

            # Capture today's health metrics on every successful Garmin connection
            self._save_health_snapshot()

        except GarminConnectConnectionError:
            sync_failed = True

        stored.sort(key=lambda a: a["start_date"], reverse=True)
        return stored, sync_failed

    def _save_health_snapshot(self) -> None:
        """Append today's VO2 max / training status to garmin/health.json if not already present."""
        today = date.today()
        date_str = today.isoformat()
        health: list = self._blob_store.read_json(_HEALTH_BLOB) or []
        if any(e.get("date") == date_str for e in health):
            return  # already captured today
        try:
            snapshot = self._garmin_client.get_health_snapshot(today)
            health.insert(0, snapshot)
            self._blob_store.write_json(_HEALTH_BLOB, health)
        except Exception:
            pass  # health snapshot is best-effort; don't fail the activity sync
