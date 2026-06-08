import json
import os
import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Any

import polyline as polyline_lib
from garminconnect import Garmin, GarminConnectConnectionError  # noqa: F401 (re-exported)

_TOKEN_BLOB = "garmin/tokens.json"
_BATCH_SIZE = 100
_MAX_ACTIVITIES = 2000


class GarminClient:
    def __init__(self, blob_store: Any) -> None:
        self._blob_store = blob_store
        email = os.environ["GARMIN_EMAIL"]
        password = os.environ["GARMIN_PASSWORD"]
        self._client = Garmin(email, password)

        # When running behind an SSL inspection proxy (e.g. Cisco Umbrella),
        # set the CA bundle on the underlying requests sessions so certificate
        # verification uses the combined corporate+certifi bundle.
        ca_bundle = os.environ.get("REQUESTS_CA_BUNDLE")
        if ca_bundle and os.path.isfile(ca_bundle):
            inner = self._client.client  # garminconnect.client.Client instance
            inner.cs.verify = ca_bundle
            inner._api_session.verify = ca_bundle

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ensure_logged_in(self) -> None:
        """Read stored tokens, log in to Garmin, and persist refreshed tokens if changed.

        Separated from fetch_activities so callers can run the login concurrently
        with other I/O (e.g. reading the activities blob).
        """
        tokens = self._blob_store.read_json(_TOKEN_BLOB)
        tokens_raw = json.dumps(tokens) if tokens is not None else None
        if tokens_raw is not None:
            self._client.login(tokens_raw)
        else:
            self._client.login()

        new_tokens_raw = self._client.client.dumps()
        if new_tokens_raw != tokens_raw:
            self._blob_store.write_json(_TOKEN_BLOB, json.loads(new_tokens_raw))

    def fetch_activities(self, after_date: date) -> list:
        """Fetch raw activities from Garmin newer than *after_date*.

        Requires ensure_logged_in() to have been called first.
        """
        all_activities: list = []
        start = 0

        while start < _MAX_ACTIVITIES:
            batch = self._client.get_activities(start, _BATCH_SIZE)
            if not batch:
                break
            for act in batch:
                start_time_str = act.get("startTimeGMT", "")
                act_date = datetime.strptime(start_time_str[:10], "%Y-%m-%d").date()
                if act_date <= after_date:
                    return all_activities
                all_activities.append(act)
            start += _BATCH_SIZE

        return all_activities

    def get_activities(self, after_date: date) -> list:
        """Login and fetch activities in one call (backwards-compatible)."""
        self.ensure_logged_in()
        return self.fetch_activities(after_date)

    def get_activity_polyline(self, activity_id: int) -> str | None:
        """Return encoded_polyline from the activity details endpoint."""
        details = self._client.get_activity_details(activity_id, maxpoly=4000)
        polyline = self._extract_polyline_from_details(details)

        if not polyline:
            gpx_data = self._client.download_activity(
                activity_id, dl_fmt=self._client.ActivityDownloadFormat.GPX
            )
            polyline = self._extract_polyline_from_gpx(gpx_data)

        return polyline

    def get_health_snapshot(self, today: date) -> dict:
        """Fetch today's VO2 max and training load/status snapshot."""
        date_str = today.isoformat()
        snapshot: dict = {"date": date_str}

        try:
            status = self._client.get_training_status(date_str)
            if isinstance(status, dict):
                # VO2 max — nested under mostRecentVO2Max.generic
                vo2_generic = (
                    status.get("mostRecentVO2Max") or {}
                ).get("generic") or {}
                snapshot["vo2max_running"] = vo2_generic.get("vo2MaxPreciseValue") or vo2_generic.get("vo2MaxValue")
                vo2_cycling = (
                    status.get("mostRecentVO2Max") or {}
                ).get("cycling") or {}
                snapshot["vo2max_cycling"] = vo2_cycling.get("vo2MaxPreciseValue") or vo2_cycling.get("vo2MaxValue")

                # Training status phrase — from primary device entry
                latest_status_map = (
                    (status.get("mostRecentTrainingStatus") or {}).get("latestTrainingStatusData") or {}
                )
                primary_status = next(
                    (v for v in latest_status_map.values() if isinstance(v, dict) and v.get("primaryTrainingDevice")),
                    next(iter(latest_status_map.values()), {}) if latest_status_map else {}
                )
                snapshot["training_status"] = primary_status.get("trainingStatusFeedbackPhrase")

                # Load focus — from primary device in mostRecentTrainingLoadBalance
                load_map = (
                    (status.get("mostRecentTrainingLoadBalance") or {}).get("metricsTrainingLoadBalanceDTOMap") or {}
                )
                primary_load = next(
                    (v for v in load_map.values() if isinstance(v, dict) and v.get("primaryTrainingDevice")),
                    next(iter(load_map.values()), {}) if load_map else {}
                )
                if primary_load:
                    snapshot["load_focus"] = {
                        "low_aerobic_actual": primary_load.get("monthlyLoadAerobicLow"),
                        "low_aerobic_low": primary_load.get("monthlyLoadAerobicLowTargetMin"),
                        "low_aerobic_high": primary_load.get("monthlyLoadAerobicLowTargetMax"),
                        "high_aerobic_actual": primary_load.get("monthlyLoadAerobicHigh"),
                        "high_aerobic_low": primary_load.get("monthlyLoadAerobicHighTargetMin"),
                        "high_aerobic_high": primary_load.get("monthlyLoadAerobicHighTargetMax"),
                        "anaerobic_actual": primary_load.get("monthlyLoadAnaerobic"),
                        "anaerobic_low": primary_load.get("monthlyLoadAnaerobicTargetMin"),
                        "anaerobic_high": primary_load.get("monthlyLoadAnaerobicTargetMax"),
                        "load_balance_phrase": primary_load.get("trainingBalanceFeedbackPhrase"),
                    }
                else:
                    snapshot["load_focus"] = None
            else:
                snapshot["vo2max_running"] = None
                snapshot["vo2max_cycling"] = None
                snapshot["training_status"] = None
                snapshot["load_focus"] = None
        except Exception:
            snapshot.setdefault("vo2max_running", None)
            snapshot.setdefault("vo2max_cycling", None)
            snapshot.setdefault("training_status", None)
            snapshot.setdefault("load_focus", None)

        # Resting Heart Rate
        try:
            rhr_data = self._client.get_rhr_day(date_str)
            if isinstance(rhr_data, dict):
                rhr_val = (
                    rhr_data.get("restingHeartRate")
                    or rhr_data.get("restingHeartRateValue")
                    or (rhr_data.get("allDayHR") or {}).get("restingHeartRateValue")
                )
                snapshot["resting_hr"] = int(rhr_val) if rhr_val is not None else None
            else:
                snapshot["resting_hr"] = None
        except Exception:
            snapshot["resting_hr"] = None

        # Training Readiness
        try:
            readiness_data = self._client.get_training_readiness(date_str)
            dto: dict | None = None
            if isinstance(readiness_data, dict):
                dto = readiness_data.get("trainingReadinessDTO") or readiness_data
            elif isinstance(readiness_data, list) and readiness_data:
                dto = readiness_data[-1]
            if dto:
                snapshot["training_readiness"] = {
                    "score": dto.get("score") or dto.get("trainingReadinessScore"),
                    "feedback": dto.get("feedbackShort") or dto.get("feedback"),
                }
            else:
                snapshot["training_readiness"] = None
        except Exception:
            snapshot["training_readiness"] = None

        return snapshot

    def get_personal_records(self) -> dict:
        """Fetch and normalise personal records + race predictions from Garmin."""
        result: dict = {"records": [], "race_predictions": None}

        # ── Personal records ──────────────────────────────────────────
        try:
            raw = self._client.get_personal_record()
            result["records"] = self._normalise_records(raw)
        except Exception:
            pass

        # ── Race predictions ──────────────────────────────────────────
        try:
            pred = self._client.get_race_predictions()
            if isinstance(pred, dict):
                result["race_predictions"] = {
                    "time_5k_seconds":              pred.get("time5K"),
                    "time_10k_seconds":             pred.get("time10K"),
                    "time_half_marathon_seconds":   pred.get("timeHalfMarathon"),
                    "time_marathon_seconds":        pred.get("timeMarathon"),
                }
        except Exception:
            pass

        return result

    # ── PR type metadata ───────────────────────────────────────────────
    # Confirmed from live API: values are seconds for time, meters for distance
    _PR_TYPE_MAP: dict = {
        # Running (timed)
        1:  ("Fastest 1K",            "running",  "time"),
        2:  ("Fastest 1 Mile",        "running",  "time"),
        3:  ("Fastest 5K",            "running",  "time"),
        4:  ("Fastest 10K",           "running",  "time"),
        5:  ("Fastest Half Marathon", "running",  "time"),
        6:  ("Fastest Marathon",      "running",  "time"),
        # Running (distance)
        7:  ("Longest Run",           "running",  "distance"),
        # Cycling (distance)
        8:  ("Longest Ride",          "cycling",  "distance"),
        # Cycling (timed)
        9:  ("Fastest 10K",           "cycling",  "time"),
        11: ("Fastest 40K",           "cycling",  "time"),
        # Swimming (timed) — pool
        17: ("Longest Swim",          "lap_swimming", "distance"),
        19: ("Fastest 50m",           "lap_swimming", "time"),
        21: ("Fastest 400m",          "lap_swimming", "time"),
        24: ("Fastest 1500m",         "lap_swimming", "time"),
    }

    def _normalise_records(self, raw: list | dict) -> list:
        """Turn Garmin's raw PR payload into a clean list of record dicts."""
        out: list = []
        items: list = []

        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            for v in raw.values():
                if isinstance(v, list):
                    items = v
                    break

        for item in items:
            if not isinstance(item, dict):
                continue

            type_id = item.get("typeId")
            if type_id is None:
                continue

            # Skip entries with no activity type (multi-sport totals, streaks, etc.)
            act_type = item.get("activityType")
            if not act_type:
                continue

            meta = self._PR_TYPE_MAP.get(type_id)
            label = meta[0] if meta else f"Record (type {type_id})"
            unit  = meta[2] if meta else "unknown"

            # Date: use the formatted field (prStartTimeGmt is a ms timestamp)
            pr_fmt = item.get("prStartTimeGmtFormatted") or item.get("actStartDateTimeInGMTFormatted") or ""
            pr_date = pr_fmt[:10] if pr_fmt else None

            out.append({
                "type_id":       type_id,
                "label":         label,
                "activity_type": act_type,
                "activity_name": item.get("activityName"),
                "value":         item.get("value"),
                "unit":          unit,
                "activity_id":   str(item["activityId"]) if item.get("activityId") else None,
                "date":          pr_date,
            })

        # Sort: running → cycling → swimming; within each group by type_id
        order = {"running": 0, "cycling": 1, "lap_swimming": 2}
        out.sort(key=lambda r: (order.get(r["activity_type"], 3), r["type_id"]))
        return out

    def save_tokens(self, blob_store: Any) -> None:
        tokens = json.loads(self._client.client.dumps())
        blob_store.write_json(_TOKEN_BLOB, tokens)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _extract_polyline_from_details(self, details: dict) -> str | None:
        for key in ("geoPolylineDTO", "summaryDTO", "connectIQMeasurements"):
            if key in details:
                segment = details[key]
                if isinstance(segment, dict):
                    for subkey in ("polyline", "points", "polylines"):
                        pts = segment.get(subkey, [])
                        if isinstance(pts, list) and len(pts) > 0:
                            coords = self._extract_coords(pts)
                            if coords:
                                return polyline_lib.encode(coords)
        return None

    def _extract_coords(self, pts: list) -> list | None:
        result = []
        for p in pts:
            if isinstance(p, dict):
                lat = p.get("lat") or p.get("latitude")
                lon = p.get("lon") or p.get("longitude")
                if lat is not None and lon is not None:
                    result.append((float(lat), float(lon)))
        return result if len(result) >= 2 else None

    def _extract_metric(self, metrics_map: dict, key: str) -> float | None:
        values = metrics_map.get(key, [])
        if isinstance(values, list) and values:
            first = values[0]
            if isinstance(first, dict):
                v = first.get("sampleValue")
                return float(v) if v is not None else None
            return float(first) if first is not None else None
        return None

    def _extract_polyline_from_gpx(self, gpx_bytes: bytes) -> str | None:
        try:
            root = ET.fromstring(gpx_bytes)
            ns = {"gpx": "http://www.topografix.com/GPX/1/1"}
            trkpts = root.findall(".//gpx:trkpt", ns)
            coords = [
                (float(pt.attrib["lat"]), float(pt.attrib["lon"])) for pt in trkpts
            ]
            return polyline_lib.encode(coords) if len(coords) >= 2 else None
        except Exception:
            return None
