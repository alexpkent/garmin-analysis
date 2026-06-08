import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from normalizer import Normalizer


# ---------------------------------------------------------------------------
# Strava tests
# ---------------------------------------------------------------------------

def _strava_run_raw():
    return {
        "id": 123456789,
        "name": "Morning Run",
        "type": "Run",
        "start_date": "2024-01-15T08:30:00Z",
        "distance": 5000.0,
        "moving_time": 1800,
        "map": {"summary_polyline": "abc123encodedpolyline"},
        "start_latlng": [51.5, -0.1],
    }


def test_normalize_strava_run():
    raw = _strava_run_raw()
    result = Normalizer.normalize_strava(raw)

    assert result["id"] == "123456789"
    assert result["source"] == "strava"
    assert result["name"] == "Morning Run"
    assert result["activity_type"] == "run"
    assert result["start_date"] == "2024-01-15T08:30:00Z"
    assert result["distance_meters"] == 5000.0
    assert result["moving_time_seconds"] == 1800
    assert result["encoded_route"] == "abc123encodedpolyline"
    assert result["start_latitude"] == 51.5
    assert result["start_longitude"] == -0.1


def test_normalize_strava_empty_polyline_becomes_null():
    raw = _strava_run_raw()
    raw["map"]["summary_polyline"] = ""
    result = Normalizer.normalize_strava(raw)
    assert result["encoded_route"] is None


def test_normalize_strava_no_latlng():
    raw = _strava_run_raw()
    raw["start_latlng"] = []
    result = Normalizer.normalize_strava(raw)
    assert result["start_latitude"] is None
    assert result["start_longitude"] is None


def test_normalize_strava_unknown_type():
    raw = _strava_run_raw()
    raw["type"] = "Skateboard"
    result = Normalizer.normalize_strava(raw)
    assert result["activity_type"] == "other"


def test_normalize_strava_type_mappings():
    """Verify all documented Strava types map correctly."""
    mapping = {
        "Run": "run",
        "TrailRun": "run",
        "VirtualRun": "run",
        "Ride": "ride",
        "VirtualRide": "ride",
        "EBikeRide": "ride",
        "Handcycle": "ride",
        "Velomobile": "ride",
        "Swim": "swim",
        "Walk": "walk",
        "Hike": "walk",
    }
    raw = _strava_run_raw()
    for strava_type, expected in mapping.items():
        raw["type"] = strava_type
        result = Normalizer.normalize_strava(raw)
        assert result["activity_type"] == expected, (
            f"Strava type {strava_type!r} → expected {expected!r}, got {result['activity_type']!r}"
        )


# ---------------------------------------------------------------------------
# Garmin tests
# ---------------------------------------------------------------------------

def _garmin_run_raw():
    return {
        "activityId": 987654321,
        "activityName": "Morning Run",
        "activityType": {"typeKey": "running"},
        "startTimeGMT": "2024-01-15 08:30:00",
        "distance": 5000.0,
        "duration": 2000.0,
        "movingDuration": 1800.0,
        "encoded_route": "abc123encodedpolyline",
        "startLatitude": 51.5,
        "startLongitude": -0.1,
        "averageHR": 145.0,
        "maxHR": 172.0,
        "aerobicTrainingEffect": 3.5,
        "anaerobicTrainingEffect": 1.2,
        "trainingEffectLabel": "IMPROVING",
        "activityTrainingLoad": 87.4,
    }


def test_normalize_garmin_run():
    raw = _garmin_run_raw()
    result = Normalizer.normalize_garmin(raw)

    assert result["id"] == "987654321"
    assert result["source"] == "garmin"
    assert result["name"] == "Morning Run"
    assert result["activity_type"] == "run"
    assert result["start_date"] == "2024-01-15T08:30:00Z"
    assert result["distance_meters"] == 5000.0
    assert result["duration"] == 2000.0
    assert result["moving_time_seconds"] == 1800.0
    assert result["encoded_route"] == "abc123encodedpolyline"
    assert result["start_latitude"] == 51.5
    assert result["start_longitude"] == -0.1
    assert result["averageHR"] == 145.0
    assert result["maxHR"] == 172.0
    assert result["trainingEffect"] == 3.5
    assert result["anaerobicTrainingEffect"] == 1.2
    assert result["trainingEffectLabel"] == "IMPROVING"
    assert result["activityTrainingLoad"] == 87.4


def test_normalize_garmin_type_mapping():
    """Multiple Garmin typeKey values map to correct activity_type."""
    mapping = {
        "running": "run",
        "trail_running": "run",
        "treadmill_running": "run",
        "indoor_running": "run",
        "cycling": "ride",
        "road_biking": "ride",
        "mountain_biking": "ride",
        "indoor_cycling": "ride",
        "virtual_ride": "ride",
        "open_water_swimming": "swim",
        "pool_swimming": "swim",
        "walking": "walk",
        "hiking": "walk",
        "soccer": "football",
        "football": "football",
        "yoga": "other",
    }
    raw = _garmin_run_raw()
    for type_key, expected in mapping.items():
        raw["activityType"]["typeKey"] = type_key
        result = Normalizer.normalize_garmin(raw)
        assert result["activity_type"] == expected, (
            f"Garmin typeKey {type_key!r} → expected {expected!r}, got {result['activity_type']!r}"
        )


def test_normalize_garmin_datetime_conversion():
    raw = _garmin_run_raw()
    raw["startTimeGMT"] = "2024-01-15 08:30:00"
    result = Normalizer.normalize_garmin(raw)
    assert result["start_date"] == "2024-01-15T08:30:00Z"


def test_normalize_garmin_movingduration_fallback():
    raw = _garmin_run_raw()
    del raw["movingDuration"]
    raw["duration"] = 2000.0
    result = Normalizer.normalize_garmin(raw)
    assert result["moving_time_seconds"] == 2000.0


def test_normalize_garmin_latlng_fallback():
    """Falls back to startLat/startLon when primary keys absent."""
    raw = _garmin_run_raw()
    del raw["startLatitude"]
    del raw["startLongitude"]
    raw["startLat"] = 52.0
    raw["startLon"] = 0.1
    result = Normalizer.normalize_garmin(raw)
    assert result["start_latitude"] == 52.0
    assert result["start_longitude"] == 0.1


def test_normalize_garmin_no_latlng():
    """Returns None when no lat/lng keys are present."""
    raw = _garmin_run_raw()
    raw.pop("startLatitude", None)
    raw.pop("startLongitude", None)
    raw.pop("startLat", None)
    raw.pop("startLon", None)
    result = Normalizer.normalize_garmin(raw)
    assert result["start_latitude"] is None
    assert result["start_longitude"] is None


def test_normalize_garmin_missing_hr_and_training_fields():
    """HR and training fields absent on raw dict → all None."""
    raw = _garmin_run_raw()
    for field in ("averageHR", "maxHR", "aerobicTrainingEffect",
                  "anaerobicTrainingEffect", "trainingEffectLabel", "activityTrainingLoad"):
        raw.pop(field, None)
    result = Normalizer.normalize_garmin(raw)
    assert result["averageHR"] is None
    assert result["maxHR"] is None
    assert result["trainingEffect"] is None
    assert result["anaerobicTrainingEffect"] is None
    assert result["trainingEffectLabel"] is None
    assert result["activityTrainingLoad"] is None


def test_normalize_garmin_absent_encoded_route():
    """encoded_route absent on raw dict → None."""
    raw = _garmin_run_raw()
    del raw["encoded_route"]
    result = Normalizer.normalize_garmin(raw)
    assert result["encoded_route"] is None


