# EN-4: Normalizer

**Wave:** 2
**Parallel Index:** 2
**Source:** EN-4

---

## Description

As a developer, I want `Normalizer` functions that convert raw Strava and Garmin activity dicts to the unified `Activity` schema, so that the function can return a consistent response regardless of source

---

## Acceptance Criteria

- Given a raw Strava activity dict, when `normalize_strava(raw)` is called, then the returned dict contains `id`, `source` = `"strava"`, `name`, `activity_type` (mapped from Strava `type`), `start_date`, `distance_meters`, `moving_time_seconds`, `encoded_route` (from `map.summary_polyline`, or `null`), `start_latitude`, and `start_longitude`
- Given a raw Garmin activity dict, when `normalize_garmin(raw)` is called, then the returned dict contains the same fields with `source` = `"garmin"` and values mapped from Garmin field names
- Given a Strava or Garmin activity type string that does not map to `run`, `ride`, `swim`, or `walk`, when the normalizer processes it, then `activity_type` is set to `"other"`

---

## Dependencies

- EN-1 → `1-1-python-api-scaffold`
