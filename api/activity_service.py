from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from threading import Thread

from garminconnect import GarminConnectConnectionError

from geocoder import fill_countries
from normalizer import Normalizer

_GARMIN_BLOB = "garmin/activities.json"
_HEALTH_BLOB = "garmin/health.json"
_RECORDS_BLOB = "garmin/records.json"
_MAX_POLYLINE_WORKERS = 8  # parallel polyline fetches


class ActivityService:
    def __init__(self, blob_store, garmin_client) -> None:
        self._blob_store = blob_store
        self._garmin_client = garmin_client

    def get_activities(self) -> tuple[list, bool]:
        sync_failed = False

        # ── Read cached activities and log in to Garmin concurrently ──────────
        # The blob read (~200 ms) and token refresh + login (~350 ms) are
        # independent, so we overlap them with a thread pool.
        with ThreadPoolExecutor(max_workers=2) as executor:
            stored_future = executor.submit(
                lambda: self._blob_store.read_json(_GARMIN_BLOB) or []
            )
            login_future = executor.submit(self._garmin_client.ensure_logged_in)
            # Raise any login error eagerly; stored result is still pending
            login_future.result()
            stored: list = stored_future.result()

        # Determine incremental sync start date from normalised start_date field.
        # Blob is always written sorted newest-first, so stored[0] is the max.
        if stored:
            after_date = datetime.strptime(stored[0]["start_date"][:10], "%Y-%m-%d").date()
        else:
            after_date = date(2000, 1, 1)

        try:
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
                # Sort once, write blob in background — don't block the response
                updated.sort(key=lambda a: a["start_date"], reverse=True)
                Thread(
                    target=self._blob_store.write_json,
                    args=(_GARMIN_BLOB, updated),
                    daemon=True,
                ).start()
                stored = updated

            # Background snapshots (health + records) — already non-blocking
            Thread(target=self._save_health_snapshot, daemon=True).start()
            Thread(target=self._save_records_snapshot, daemon=True).start()

        except GarminConnectConnectionError:
            sync_failed = True

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
