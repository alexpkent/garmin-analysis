import os
import sys
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from garminconnect import GarminConnectConnectionError  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ENV = {"GARMIN_EMAIL": "test@example.com", "GARMIN_PASSWORD": "secret"}


def _activity(activity_id: int, date_str: str) -> dict:
    return {"activityId": activity_id, "startTimeGMT": f"{date_str} 10:00:00"}


# ---------------------------------------------------------------------------
# Authentication / token tests
# ---------------------------------------------------------------------------


@patch("garmin_client.Garmin")
def test_get_activities_no_tokens_authenticates_fresh(mock_garmin_cls):
    """No token blob: fresh login called, tokens saved, activities returned."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.client.dumps.return_value = '{"di_token": "tok123", "di_refresh_token": "ref123", "di_client_id": "cid"}'
    mock_garmin.get_activities.side_effect = [
        [_activity(1, "2024-02-01")],
        [],
    ]

    mock_blob_store = MagicMock()
    mock_blob_store.read_json.return_value = None

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        activities = client.get_activities(date(2024, 1, 1))

    mock_garmin.login.assert_called_once_with()
    mock_blob_store.write_json.assert_called_once_with(
        "garmin/tokens.json", {"di_token": "tok123", "di_refresh_token": "ref123", "di_client_id": "cid"}
    )
    assert len(activities) == 1


@patch("garmin_client.Garmin")
def test_get_activities_with_tokens_restores_session(mock_garmin_cls):
    """Token blob present: login called with saved token dict, no fresh login."""
    import json
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activities.return_value = []
    mock_garmin.client.dumps.return_value = json.dumps({"di_token": "tok", "di_refresh_token": "ref", "di_client_id": "cid"})

    token_dict = {"access_token": "saved_token", "refresh_token": "refresh"}
    mock_blob_store = MagicMock()
    mock_blob_store.read_json.return_value = token_dict

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        client.get_activities(date(2024, 1, 1))

    import json
    mock_garmin.login.assert_called_once_with(json.dumps(token_dict))


# ---------------------------------------------------------------------------
# Date filtering
# ---------------------------------------------------------------------------


@patch("garmin_client.Garmin")
def test_get_activities_with_expired_tokens_saves_refreshed_tokens(mock_garmin_cls):
    """Expired token blob: library refreshes tokens during login; refreshed tokens are saved."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activities.return_value = []

    import json
    old_tokens = {"di_token": "expired_tok", "di_refresh_token": "old_refresh", "di_client_id": "cid"}
    new_tokens = {"di_token": "refreshed_tok", "di_refresh_token": "new_refresh", "di_client_id": "cid"}
    mock_garmin.client.dumps.return_value = json.dumps(new_tokens)

    mock_blob_store = MagicMock()
    mock_blob_store.read_json.return_value = old_tokens

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        client.get_activities(date(2024, 1, 1))

    mock_garmin.login.assert_called_once_with(json.dumps(old_tokens))
    mock_blob_store.write_json.assert_called_once_with(
        "garmin/tokens.json", new_tokens
    )


@patch("garmin_client.Garmin")
def test_get_activities_filters_by_after_date(mock_garmin_cls):
    """Activities on or before after_date are excluded; those after are included."""
    import json
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activities.return_value = [
        _activity(1, "2024-02-10"),  # after  → included
        _activity(2, "2024-01-15"),  # after  → included
        _activity(3, "2024-01-01"),  # on     → excluded (stops here)
        _activity(4, "2023-12-25"),  # before → excluded
    ]
    mock_garmin.client.dumps.return_value = json.dumps({"di_token": "tok", "di_refresh_token": "ref", "di_client_id": "cid"})

    mock_blob_store = MagicMock()
    mock_blob_store.read_json.return_value = {"access_token": "tok"}

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        activities = client.get_activities(date(2024, 1, 1))

    assert len(activities) == 2
    assert activities[0]["activityId"] == 1
    assert activities[1]["activityId"] == 2


# ---------------------------------------------------------------------------
# Polyline extraction
# ---------------------------------------------------------------------------


@patch("garmin_client.Garmin")
def test_get_activity_polyline_uses_details_endpoint(mock_garmin_cls):
    """get_activity_details provides coords → polyline returned."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activity_details.return_value = {
        "geoPolylineDTO": {
            "polyline": [
                {"lat": 51.5, "lon": -0.1},
                {"lat": 51.6, "lon": -0.2},
            ]
        }
    }

    mock_blob_store = MagicMock()

    with patch.dict(os.environ, _ENV):
        import polyline as polyline_lib

        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        result = client.get_activity_polyline(123)

    mock_garmin.get_activity_details.assert_called_once_with(123, maxpoly=4000)
    mock_garmin.download_activity.assert_not_called()
    expected = polyline_lib.encode([(51.5, -0.1), (51.6, -0.2)])
    assert result == expected


@patch("garmin_client.Garmin")
def test_get_activity_polyline_falls_back_to_gpx(mock_garmin_cls):
    """details returns no coords → GPX download called → polyline from GPX."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activity_details.return_value = {}

    gpx_xml = (
        b'<?xml version="1.0"?>'
        b'<gpx xmlns="http://www.topografix.com/GPX/1/1">'
        b"<trk><trkseg>"
        b'<trkpt lat="51.5" lon="-0.1"></trkpt>'
        b'<trkpt lat="51.6" lon="-0.2"></trkpt>'
        b"</trkseg></trk></gpx>"
    )
    mock_garmin.download_activity.return_value = gpx_xml

    mock_blob_store = MagicMock()

    with patch.dict(os.environ, _ENV):
        import polyline as polyline_lib

        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        result = client.get_activity_polyline(456)

    mock_garmin.download_activity.assert_called_once()
    expected = polyline_lib.encode([(51.5, -0.1), (51.6, -0.2)])
    assert result == expected


@patch("garmin_client.Garmin")
def test_get_activity_polyline_returns_none_when_no_route(mock_garmin_cls):
    """Neither details nor GPX provide coords → None returned."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.get_activity_details.return_value = {}
    mock_garmin.download_activity.return_value = b"<gpx/>"  # no trackpoints

    mock_blob_store = MagicMock()

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        result = client.get_activity_polyline(789)

    assert result is None


# ---------------------------------------------------------------------------
# Error propagation
# ---------------------------------------------------------------------------


@patch("garmin_client.Garmin")
def test_connection_error_propagates(mock_garmin_cls):
    """GarminConnectConnectionError from login() must propagate to caller."""
    mock_garmin = MagicMock()
    mock_garmin_cls.return_value = mock_garmin
    mock_garmin.login.side_effect = GarminConnectConnectionError("unreachable")

    mock_blob_store = MagicMock()
    mock_blob_store.read_json.return_value = None  # trigger fresh login

    with patch.dict(os.environ, _ENV):
        from garmin_client import GarminClient

        client = GarminClient(mock_blob_store)
        with pytest.raises(GarminConnectConnectionError):
            client.get_activities(date(2024, 1, 1))
