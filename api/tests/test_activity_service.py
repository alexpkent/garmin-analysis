import os
import sys
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, call

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from garminconnect import GarminConnectConnectionError  # noqa: E402

from activity_service import ActivityService  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GARMIN_BLOB = "garmin/activities.json"
_SYNC_STATUS_BLOB = "garmin/sync-status.json"


def _sync_status(minutes_ago: int) -> dict:
    sync_time = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return {"last_successful_sync": sync_time.isoformat().replace("+00:00", "Z")}


def _stored_activity(
    activity_id: int,
    date_str: str,
    encoded_route=None,
    source="garmin",
) -> dict:
    """Normalised activity as stored in garmin/activities.json (post-migration format)."""
    return {
        "id": str(activity_id),
        "source": source,
        "name": f"Activity {activity_id}",
        "activity_type": "run",
        "start_date": f"{date_str}T08:00:00Z",
        "distance_meters": 5000.0,
        "moving_time_seconds": 1800.0,
        "encoded_route": encoded_route,
        "start_latitude": 51.5,
        "start_longitude": -0.1,
    }


def _garmin_raw_activity(activity_id: int, date_str: str) -> dict:
    """Raw activity as returned by the Garmin API (garmin_client.get_activities)."""
    return {
        "activityId": activity_id,
        "activityName": f"Activity {activity_id}",
        "startTimeGMT": f"{date_str} 08:00:00",
        "activityType": {"typeKey": "running"},
        "distance": 5000.0,
        "movingDuration": 1800.0,
    }


def _make_service(garmin_blob=None, sync_status=None):
    mock_blob = MagicMock()
    mock_garmin = MagicMock()

    mock_blob.read_json.side_effect = lambda name: (
        garmin_blob if name == _GARMIN_BLOB else sync_status if name == _SYNC_STATUS_BLOB else None
    )
    mock_garmin.fetch_activities.return_value = []
    mock_garmin.get_activity_polyline.return_value = None

    service = ActivityService(mock_blob, mock_garmin)
    return service, mock_blob, mock_garmin


def _write_calls(mock_blob, blob_name: str) -> list:
    return [c for c in mock_blob.write_json.call_args_list if c[0][0] == blob_name]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_first_sync_fetches_all_activities():
    """No prior garmin blob → get_activities called with date(2000,1,1); activities stored."""
    new_act = _garmin_raw_activity(1001, "2024-02-01")
    service, mock_blob, mock_garmin = _make_service(garmin_blob=None)
    mock_garmin.fetch_activities.return_value = [new_act]
    mock_garmin.get_activity_polyline.return_value = "polyline1"

    activities, sync_failed = service.get_activities()

    mock_garmin.fetch_activities.assert_called_once_with(date(2000, 1, 1))
    written_activity_calls = [c for c in mock_blob.write_json.call_args_list if c[0][0] == _GARMIN_BLOB]
    assert len(written_activity_calls) == 1
    assert sync_failed is False


def test_fresh_sync_status_returns_cached_data_without_garmin_call():
    """Recent successful sync → return cached blob only and do not call Garmin."""
    garmin_blob = [_stored_activity(1001, "2024-01-10", encoded_route="p1")]
    service, mock_blob, mock_garmin = _make_service(
        garmin_blob=garmin_blob,
        sync_status=_sync_status(minutes_ago=5),
    )

    activities, sync_failed = service.get_activities()

    assert activities == garmin_blob
    assert sync_failed is False
    mock_garmin.ensure_logged_in.assert_not_called()
    mock_garmin.fetch_activities.assert_not_called()
    mock_blob.write_json.assert_not_called()


def test_incremental_sync_uses_last_date():
    """Prior garmin blob with latest date 2024-01-10 → get_activities called with that date."""
    garmin_blob = [
        _stored_activity(1001, "2024-01-10", encoded_route="p1"),
        _stored_activity(1002, "2024-01-05", encoded_route="p2"),
    ]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.fetch_activities.return_value = []

    service.get_activities()

    mock_garmin.fetch_activities.assert_called_once_with(date(2024, 1, 10))
    status_writes = _write_calls(mock_blob, _SYNC_STATUS_BLOB)
    assert len(status_writes) == 1


def test_no_duplicates_on_incremental_sync():
    """Activity already in the blob and also returned by Garmin appears only once."""
    existing = _stored_activity(1001, "2024-01-10", encoded_route="p1")
    garmin_blob = [existing]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    # Garmin returns the same activity again
    mock_garmin.fetch_activities.return_value = [_garmin_raw_activity(1001, "2024-01-10")]
    mock_garmin.get_activity_polyline.return_value = "p1"

    activities, _ = service.get_activities()

    garmin_activities = [a for a in activities if a["source"] == "garmin"]
    assert len(garmin_activities) == 1
    assert garmin_activities[0]["id"] == "1001"


def test_polyline_fetched_for_new_activities():
    """get_activity_polyline called for each new activity; encoded_route stored."""
    new_act = _garmin_raw_activity(1001, "2024-02-01")
    service, mock_blob, mock_garmin = _make_service()
    mock_garmin.fetch_activities.return_value = [new_act]
    mock_garmin.get_activity_polyline.return_value = "encoded_polyline_123"

    activities, _ = service.get_activities()

    mock_garmin.get_activity_polyline.assert_called_once_with(1001)
    written_data = _write_calls(mock_blob, _GARMIN_BLOB)[0][0][1]
    assert written_data[0]["encoded_route"] == "encoded_polyline_123"


def test_garmin_unreachable_serves_cached_data():
    """GarminConnectConnectionError raised → sync_failed=True; cached data still returned."""
    garmin_blob = [_stored_activity(1001, "2024-01-10", encoded_route="p1")]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.fetch_activities.side_effect = GarminConnectConnectionError("unreachable")

    activities, sync_failed = service.get_activities()

    assert sync_failed is True
    assert any(a["id"] == "1001" and a["source"] == "garmin" for a in activities)
    status_writes = _write_calls(mock_blob, _SYNC_STATUS_BLOB)
    assert len(status_writes) == 1


def test_strava_source_activities_preserved_in_stored_blob():
    """Activities with source='strava' in the blob (migrated from Strava) are returned as-is."""
    garmin_blob = [
        _stored_activity(1001, "2024-01-10", encoded_route="p1", source="garmin"),
        _stored_activity(9001, "2024-01-09", encoded_route="abc", source="strava"),
    ]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.fetch_activities.return_value = []

    activities, _ = service.get_activities()

    sources = {a["source"] for a in activities}
    assert "garmin" in sources
    assert "strava" in sources
    assert any(a["id"] == "1001" for a in activities)
    assert any(a["id"] == "9001" for a in activities)


def test_result_sorted_descending_by_date():
    """Unified result is sorted newest-first by start_date."""
    garmin_blob = [
        _stored_activity(1001, "2024-01-05", encoded_route="p1"),
        _stored_activity(1002, "2024-01-15", encoded_route="p2"),
        _stored_activity(9001, "2024-01-10", encoded_route="abc", source="strava"),
    ]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.fetch_activities.return_value = []

    activities, _ = service.get_activities()

    dates = [a["start_date"] for a in activities]
    assert dates == sorted(dates, reverse=True)


def test_incremental_sync_retains_existing_and_adds_new():
    """Existing activity in blob is retained when a different new activity is added."""
    garmin_blob = [_stored_activity(100, "2024-01-10", encoded_route="p1")]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.fetch_activities.return_value = [_garmin_raw_activity(200, "2024-01-15")]
    mock_garmin.get_activity_polyline.return_value = "polyline_new"

    activities, sync_failed = service.get_activities()

    garmin_activities = [a for a in activities if a["source"] == "garmin"]
    ids = {a["id"] for a in garmin_activities}
    assert "100" in ids
    assert "200" in ids
    assert sync_failed is False


def test_garmin_unreachable_no_prior_data_returns_empty_with_error():
    """AC3: Garmin unreachable with no prior data → empty list and sync_failed=True."""
    service, mock_blob, mock_garmin = _make_service(garmin_blob=None)
    mock_garmin.fetch_activities.side_effect = GarminConnectConnectionError("unreachable")

    activities, sync_failed = service.get_activities()

    assert activities == []
    assert sync_failed is True
    status_writes = _write_calls(mock_blob, _SYNC_STATUS_BLOB)
    assert len(status_writes) == 1
