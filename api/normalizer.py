from datetime import datetime

from geocoder import country_code


_STRAVA_TYPE_MAP = {
    "run": {"Run", "TrailRun", "VirtualRun"},
    "ride": {"Ride", "VirtualRide", "EBikeRide", "Handcycle", "Velomobile"},
    "swim": {"Swim"},
    "walk": {"Walk", "Hike"},
}

_GARMIN_TYPE_MAP = {
    "run": {"running", "trail_running", "treadmill_running", "indoor_running"},
    "ride": {"cycling", "road_biking", "mountain_biking", "indoor_cycling", "virtual_ride"},
    "swim": {"open_water_swimming", "pool_swimming"},
    "walk": {"walking", "hiking"},
}


def _map_type(raw_type: str, type_map: dict) -> str:
    for activity_type, raw_set in type_map.items():
        if raw_type in raw_set:
            return activity_type
    return "other"


class Normalizer:

    @staticmethod
    def normalize_strava(raw: dict) -> dict:
        latlng = raw.get("start_latlng") or []
        polyline = (raw.get("map") or {}).get("summary_polyline") or None
        if polyline == "":
            polyline = None

        return {
            "id": str(raw["id"]),
            "source": "strava",
            "name": raw["name"],
            "activity_type": _map_type(raw.get("type", ""), _STRAVA_TYPE_MAP),
            "start_date": raw["start_date"],
            "distance_meters": raw["distance"],
            "moving_time_seconds": raw["moving_time"],
            "encoded_route": polyline,
            "start_latitude": latlng[0] if len(latlng) >= 2 else None,
            "start_longitude": latlng[1] if len(latlng) >= 2 else None,
            "country": country_code(latlng[0] if len(latlng) >= 2 else None,
                                    latlng[1] if len(latlng) >= 2 else None),
        }

    @staticmethod
    def normalize_garmin(raw: dict) -> dict:
        type_key = (raw.get("activityType") or {}).get("typeKey", "")
        start_time = datetime.strptime(raw["startTimeGMT"], "%Y-%m-%d %H:%M:%S").strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        moving_time = raw.get("movingDuration") if "movingDuration" in raw else raw.get("duration")

        lat = raw.get("startLatitude") if "startLatitude" in raw else raw.get("startLat")
        lon = raw.get("startLongitude") if "startLongitude" in raw else raw.get("startLon")

        # Cap distance at 1000 km to guard against bad GPS recordings
        raw_distance = raw["distance"] or 0
        distance_meters = min(float(raw_distance), 1_000_000)

        encoded_route = raw.get("encoded_route")

        return {
            "id": str(raw["activityId"]),
            "source": "garmin",
            "name": raw["activityName"],
            "activity_type": _map_type(type_key, _GARMIN_TYPE_MAP),
            "start_date": start_time,
            "distance_meters": distance_meters,
            "duration": raw.get("duration"),
            "moving_time_seconds": moving_time,
            "encoded_route": encoded_route,
            "start_latitude": lat,
            "start_longitude": lon,
            "country": country_code(lat, lon),
            "averageHR": raw.get("averageHR"),
            "maxHR": raw.get("maxHR"),
            "trainingEffect": raw.get("aerobicTrainingEffect"),
            "anaerobicTrainingEffect": raw.get("anaerobicTrainingEffect"),
            "trainingEffectLabel": raw.get("trainingEffectLabel"),
            "activityTrainingLoad": raw.get("activityTrainingLoad"),
        }
