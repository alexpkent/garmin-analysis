import os
import sys
from datetime import date
from unittest.mock import MagicMock, call

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from garminconnect import GarminConnectConnectionError  # noqa: E402

from activity_service import ActivityService  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GARMIN_BLOB = "garmin/activities.json"
_STRAVA_BLOB = "strava/activities.json"


def _garmin_activity(activity_id: int, date_str: str, encoded_route=None) -> dict:
    return {
        "activityId": activity_id,
        "activityName": f"Activity {activity_id}",
        "startTimeGMT": f"{date_str} 08:00:00",
        "activityType": {"typeKey": "running"},
        "distance": 5000.0,
        "movingDuration": 1800.0,
        "encoded_route": encoded_route,
    }


def _strava_activity(activity_id: int, date_str: str) -> dict:
    return {
        "id": activity_id,
        "name": f"Strava Activity {activity_id}",
        "start_date": f"{date_str}T08:00:00Z",
        "type": "Run",
        "distance": 5000.0,
        "moving_time": 1800,
        "map": {"summary_polyline": "abc123"},
        "start_latlng": [51.5, -0.1],
    }


def _make_service(garmin_blob=None, strava_blob=None):
    mock_blob = MagicMock()
    mock_garmin = MagicMock()

    blobs = {
        _GARMIN_BLOB: garmin_blob,
        _STRAVA_BLOB: strava_blob,
    }
    mock_blob.read_json.side_effect = lambda name: blobs.get(name)

    service = ActivityService(mock_blob, mock_garmin)
    return service, mock_blob, mock_garmin


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_first_sync_fetches_all_activities():
    """No prior garmin blob → get_activities called with date(2000,1,1); activities stored."""
    new_act = _garmin_activity(1001, "2024-02-01")
    service, mock_blob, mock_garmin = _make_service(garmin_blob=None, strava_blob=None)
    mock_garmin.get_activities.return_value = [new_act]
    mock_garmin.get_activity_polyline.return_value = "polyline1"

    activities, sync_failed = service.get_activities()

    mock_garmin.get_activities.assert_called_once_with(date(2000, 1, 1))
    mock_blob.write_json.assert_called_once()
    written_blob_name = mock_blob.write_json.call_args[0][0]
    assert written_blob_name == _GARMIN_BLOB
    assert sync_failed is False


def test_incremental_sync_uses_last_date():
    """Prior garmin blob with latest date 2024-01-10 → get_activities called with that date."""
    garmin_blob = [
        _garmin_activity(1001, "2024-01-10", encoded_route="p1"),
        _garmin_activity(1002, "2024-01-05", encoded_route="p2"),
    ]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.get_activities.return_value = []

    service.get_activities()

    mock_garmin.get_activities.assert_called_once_with(date(2024, 1, 10))


def test_no_duplicates_on_incremental_sync():
    """Activity already in the blob and also returned by Garmin appears only once."""
    existing = _garmin_activity(1001, "2024-01-10", encoded_route="p1")
    garmin_blob = [existing]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    # Garmin returns the same activity again
    mock_garmin.get_activities.return_value = [_garmin_activity(1001, "2024-01-10")]
    mock_garmin.get_activity_polyline.return_value = "p1"

    activities, _ = service.get_activities()

    garmin_activities = [a for a in activities if a["source"] == "garmin"]
    assert len(garmin_activities) == 1
    assert garmin_activities[0]["id"] == "1001"


def test_polyline_fetched_for_new_activities():
    """get_activity_polyline called for each new activity; encoded_route stored."""
    new_act = _garmin_activity(1001, "2024-02-01")
    service, mock_blob, mock_garmin = _make_service()
    mock_garmin.get_activities.return_value = [new_act]
    mock_garmin.get_activity_polyline.return_value = "encoded_polyline_123"

    activities, _ = service.get_activities()

    mock_garmin.get_activity_polyline.assert_called_once_with(1001)
    written_data = mock_blob.write_json.call_args[0][1]
    assert written_data[0]["encoded_route"] == "encoded_polyline_123"


def test_backfill_up_to_20_activities_without_route():
    """25 existing activities with encoded_route=None → polyline fetched for exactly 20."""
    garmin_blob = [_garmin_activity(i, f"2024-01-{i:02d}") for i in range(1, 26)]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.get_activities.return_value = []  # no new activities
    mock_garmin.get_activity_polyline.return_value = "polyline"

    service.get_activities()

    assert mock_garmin.get_activity_polyline.call_count == 20


def test_garmin_unreachable_serves_cached_data():
    """GarminConnectConnectionError raised → sync_failed=True; cached data still returned."""
    garmin_blob = [_garmin_activity(1001, "2024-01-10", encoded_route="p1")]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.get_activities.side_effect = GarminConnectConnectionError("unreachable")

    activities, sync_failed = service.get_activities()

    assert sync_failed is True
    assert any(a["id"] == "1001" and a["source"] == "garmin" for a in activities)
    mock_blob.write_json.assert_not_called()


def test_strava_activities_included_in_result():
    """Strava blob activities appear in the unified result alongside garmin activities."""
    garmin_blob = [_garmin_activity(1001, "2024-01-10", encoded_route="p1")]
    strava_blob = [_strava_activity(9001, "2024-01-09")]
    service, mock_blob, mock_garmin = _make_service(
        garmin_blob=garmin_blob, strava_blob=strava_blob
    )
    mock_garmin.get_activities.return_value = []

    activities, _ = service.get_activities()

    sources = {a["source"] for a in activities}
    assert "garmin" in sources
    assert "strava" in sources
    assert any(a["id"] == "1001" for a in activities)
    assert any(a["id"] == "9001" for a in activities)


def test_result_sorted_descending_by_date():
    """Unified result is sorted newest-first by start_date."""
    garmin_blob = [
        _garmin_activity(1001, "2024-01-05", encoded_route="p1"),
        _garmin_activity(1002, "2024-01-15", encoded_route="p2"),
    ]
    strava_blob = [_strava_activity(9001, "2024-01-10")]
    service, mock_blob, mock_garmin = _make_service(
        garmin_blob=garmin_blob, strava_blob=strava_blob
    )
    mock_garmin.get_activities.return_value = []

    activities, _ = service.get_activities()

    dates = [a["start_date"] for a in activities]
    assert dates == sorted(dates, reverse=True)


def test_incremental_sync_retains_existing_and_adds_new():
    """AC2: existing activity in blob is retained when a different new activity is added."""
    existing = _garmin_activity(100, "2024-01-10", encoded_route="p1")
    garmin_blob = [existing]
    service, mock_blob, mock_garmin = _make_service(garmin_blob=garmin_blob)
    mock_garmin.get_activities.return_value = [_garmin_activity(200, "2024-01-15")]
    mock_garmin.get_activity_polyline.return_value = "polyline_new"

    activities, sync_failed = service.get_activities()

    garmin_activities = [a for a in activities if a["source"] == "garmin"]
    ids = {a["id"] for a in garmin_activities}
    assert "100" in ids
    assert "200" in ids
    assert sync_failed is False


def test_garmin_unreachable_no_prior_data_returns_empty_with_error():
    """AC3: Garmin unreachable with no prior data → empty list and sync_failed=True."""
    service, mock_blob, mock_garmin = _make_service(garmin_blob=None, strava_blob=None)
    mock_garmin.get_activities.side_effect = GarminConnectConnectionError("unreachable")

    activities, sync_failed = service.get_activities()

    assert activities == []
    assert sync_failed is True
    mock_blob.write_json.assert_not_called()
