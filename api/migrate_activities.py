"""One-off migration: merge strava/activities.json into garmin/activities.json.

Two modes:

1. Blob-only (default):
   Reads both blobs, normalises all activities, deduplicates by start time
   (5-minute window), and writes the combined normalised list back to
   garmin/activities.json.  Where a Strava and Garmin activity match, the
   Garmin record is kept and the Strava polyline is used as a fallback if
   Garmin has none.

2. --fetch-garmin:
   Fetches ALL Garmin activities directly from the Garmin API (no polylines),
   normalises them, then merges with Strava activities that have no Garmin
   counterpart (i.e. pre-Garmin history).  Use this when you want the full
   Garmin dataset with the latest fields (HR, training load, etc.).

Run from the api/ directory:
    python migrate_activities.py
    python migrate_activities.py --fetch-garmin
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from blob_store import BlobStore
from normalizer import Normalizer

_STRAVA_BLOB = "strava/activities.json"
_GARMIN_BLOB = "garmin/activities.json"
_MATCH_WINDOW_SECONDS = 300  # 5 minutes


def _load_local_settings() -> None:
    settings_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local.settings.json")
    if not os.path.isfile(settings_path):
        return
    with open(settings_path) as f:
        settings = json.load(f)
    for key, value in settings.get("Values", {}).items():
        if key not in os.environ:
            os.environ[key] = str(value)


def _parse_iso(date_str: str) -> datetime:
    return datetime.strptime(date_str[:19], "%Y-%m-%dT%H:%M:%S")


def _is_normalised(activities: list) -> bool:
    if not activities:
        return False
    return "id" in activities[0] and "start_date" in activities[0]


def _merge(garmin_norm: list, strava_raw: list) -> list:
    """Deduplicate by start time; keep Garmin record for matches; keep Strava-only for the rest."""
    strava_norm = [Normalizer.normalize_strava(a) for a in strava_raw]

    garmin_with_dates = [(a, _parse_iso(a["start_date"])) for a in garmin_norm]

    matched_garmin_ids: set = set()
    strava_only: list = []

    for s_act in strava_norm:
        s_dt = _parse_iso(s_act["start_date"])
        match = None
        for g_act, g_dt in garmin_with_dates:
            if abs((s_dt - g_dt).total_seconds()) <= _MATCH_WINDOW_SECONDS:
                match = g_act
                break

        if match:
            matched_garmin_ids.add(match["id"])
            # Fill missing polyline from Strava
            if not match.get("encoded_route") and s_act.get("encoded_route"):
                match["encoded_route"] = s_act["encoded_route"]
        else:
            strava_only.append(s_act)

    garmin_matched = [a for a, _ in garmin_with_dates if a["id"] in matched_garmin_ids]
    garmin_only = [a for a, _ in garmin_with_dates if a["id"] not in matched_garmin_ids]

    print(f"\nMerge results:")
    print(f"  Garmin matched with Strava : {len(garmin_matched)}")
    print(f"  Strava-only (no Garmin)    : {len(strava_only)}")
    print(f"  Garmin-only (no Strava)    : {len(garmin_only)}")

    combined = strava_only + garmin_matched + garmin_only
    combined.sort(key=lambda a: a["start_date"], reverse=True)
    return combined


def migrate(connection_string: str, container: str, fetch_garmin: bool = False) -> None:
    blob_store = BlobStore(connection_string, container)
    strava_raw: list = blob_store.read_json(_STRAVA_BLOB) or []
    print(f"Strava activities  : {len(strava_raw)}")

    if fetch_garmin:
        print("Fetching all Garmin activities via API (no polylines)...")
        from garmin_client import GarminClient
        garmin_client = GarminClient(blob_store)
        garmin_raw_api = garmin_client.get_activities(date(2000, 1, 1))
        print(f"Garmin activities fetched: {len(garmin_raw_api)}")
        garmin_norm = [Normalizer.normalize_garmin(a) for a in garmin_raw_api]
    else:
        garmin_raw: list = blob_store.read_json(_GARMIN_BLOB) or []
        print(f"Garmin activities  : {len(garmin_raw)}")
        if _is_normalised(garmin_raw):
            print("garmin/activities.json is already normalised – using as-is.")
            garmin_norm = garmin_raw
        else:
            garmin_norm = [Normalizer.normalize_garmin(a) for a in garmin_raw]

    combined = _merge(garmin_norm, strava_raw)
    print(f"  Combined total             : {len(combined)}")

    blob_store.write_json(_GARMIN_BLOB, combined)
    print(f"\nWritten {len(combined)} normalised activities to {_GARMIN_BLOB}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate/merge Strava + Garmin activities.")
    parser.add_argument(
        "--fetch-garmin",
        action="store_true",
        help="Fetch all Garmin activities from the API instead of reading the blob.",
    )
    args = parser.parse_args()

    _load_local_settings()

    conn_str = os.environ.get("BLOB_CONNECTION_STRING")
    container = os.environ.get("BLOB_CONTAINER", "activities")

    if not conn_str:
        print("ERROR: BLOB_CONNECTION_STRING not set and not found in local.settings.json")
        sys.exit(1)

    migrate(conn_str, container, fetch_garmin=args.fetch_garmin)

