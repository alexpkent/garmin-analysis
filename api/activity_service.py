from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import os
from threading import Thread

from garminconnect import GarminConnectConnectionError

from geocoder import fill_countries
from normalizer import Normalizer

_GARMIN_BLOB = "garmin/activities.json"
_HEALTH_BLOB = "garmin/health.json"
_RECORDS_BLOB = "garmin/records.json"
_SYNC_STATUS_BLOB = "garmin/sync-status.json"
_DEFAULT_SYNC_INTERVAL_MINUTES = 15
_MAX_POLYLINE_WORKERS = 8  # parallel polyline fetches


class ActivityService:
    def __init__(self, blob_store, garmin_client) -> None:
        self._blob_store = blob_store
        self._garmin_client = garmin_client
        self._sync_interval = timedelta(minutes=self._sync_interval_minutes())

    def get_activities(self) -> tuple[list, bool]:
        sync_failed = False
        stored: list = self._blob_store.read_json(_GARMIN_BLOB) or []
        self._sort_activities(stored)

        if self._sync_is_fresh():
            return stored, sync_failed

        sync_attempted_at = self._utc_now()

        try:
            self._garmin_client.ensure_logged_in()

            # Determine incremental sync start date from normalised start_date field.
            # Blob is always written sorted newest-first, so stored[0] is the max.
            if stored:
                after_date = datetime.strptime(stored[0]["start_date"][:10], "%Y-%m-%d").date()
            else:
                after_date = date(2000, 1, 1)

            # Fetch new raw activities since last known date
            new_raw: list = self._garmin_client.fetch_activities(after_date)

            # ── Fetch polylines in parallel ───────────────────────────────────
            if new_raw:
                workers = min(len(new_raw), _MAX_POLYLINE_WORKERS)
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    polylines = list(pool.map(
                        lambda act: self._garmin_client.get_activity_polyline(act["activityId"]),
                        new_raw,
                    ))
                for act, pl in zip(new_raw, polylines):
                    act["encoded_route"] = pl

            # Normalise and merge
            new_normalised = [Normalizer.normalize_garmin(a) for a in new_raw]
            new_ids = {a["id"] for a in new_normalised}

            if new_raw:
                updated = new_normalised + [a for a in stored if a["id"] not in new_ids]
                # Sort once and persist before marking the sync successful.
                self._sort_activities(updated)
                self._blob_store.write_json(_GARMIN_BLOB, updated)
                stored = updated

            self._write_sync_status(
                {
                    "last_attempted_sync": self._format_time(sync_attempted_at),
                    "last_successful_sync": self._format_time(self._utc_now()),
                    "last_failed_sync": None,
                }
            )

            # Background snapshots (health + records) — already non-blocking
            Thread(target=self._save_health_snapshot, daemon=True).start()
            Thread(target=self._save_records_snapshot, daemon=True).start()

        except GarminConnectConnectionError:
            sync_failed = True
            self._write_sync_status(
                {
                    "last_attempted_sync": self._format_time(sync_attempted_at),
                    "last_failed_sync": self._format_time(self._utc_now()),
                }
            )

        # Enrich any activities missing the country field (fast batch KD-tree lookup).
        # Done synchronously so every response includes country data; persistence
        # happens in the background so it doesn't delay the HTTP response.
        if fill_countries(stored):
            Thread(
                target=self._blob_store.write_json,
                args=(_GARMIN_BLOB, stored),
                daemon=True,
            ).start()

        # stored is already sorted newest-first (blob is always written sorted,
        # and any new merge is sorted above before assignment).
        return stored, sync_failed

    def _sort_activities(self, activities: list) -> None:
        activities.sort(key=lambda a: a["start_date"], reverse=True)

    def _sync_is_fresh(self) -> bool:
        status = self._blob_store.read_json(_SYNC_STATUS_BLOB)
        if not isinstance(status, dict):
            return False

        last_successful_sync = self._parse_time(status.get("last_successful_sync"))
        if last_successful_sync is None:
            return False

        return self._utc_now() - last_successful_sync < self._sync_interval

    def _write_sync_status(self, updates: dict) -> None:
        existing = self._blob_store.read_json(_SYNC_STATUS_BLOB)
        status = existing if isinstance(existing, dict) else {}
        status.update(updates)
        self._blob_store.write_json(_SYNC_STATUS_BLOB, status)

    def _sync_interval_minutes(self) -> int:
        raw = os.environ.get("GARMIN_SYNC_INTERVAL_MINUTES")
        if raw is None:
            return _DEFAULT_SYNC_INTERVAL_MINUTES
        try:
            value = int(raw)
            return value if value > 0 else _DEFAULT_SYNC_INTERVAL_MINUTES
        except ValueError:
            return _DEFAULT_SYNC_INTERVAL_MINUTES

    def _utc_now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _format_time(self, value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _parse_time(self, value: object) -> datetime | None:
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)


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

    def _save_records_snapshot(self) -> None:
        """Refresh garmin/records.json once per day with latest PRs + race predictions."""
        today = date.today()
        date_str = today.isoformat()
        existing: dict | None = self._blob_store.read_json(_RECORDS_BLOB)
        if isinstance(existing, dict) and existing.get("date") == date_str:
            return  # already fetched today
        try:
            data = self._garmin_client.get_personal_records()
            data["date"] = date_str
            self._blob_store.write_json(_RECORDS_BLOB, data)
        except Exception:
            pass  # records are best-effort
