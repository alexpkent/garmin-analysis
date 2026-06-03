# Garmin Connect Migration Research Findings

## Task 1: Garmin Activity List Response Fields

### Confirmed

From `python-garminconnect` source and tests:

- The activity list endpoint used by `get_activities(start, limit, activitytype)` is:
  - `/activitylist-service/activities/search/activities`
- Confirmed list-item keys used in typed models/tests include:
  - `activityId`
  - `activityName`
  - `startTimeLocal`
  - `startTimeGMT`
  - `activityType` with nested `typeKey` (also `typeId`, `parentTypeId`, `isHidden` in sample)
  - `duration`
  - `movingDuration`
  - `distance`
  - Additional commonly present metrics in sample payload: `elevationGain`, `elevationLoss`, `averageHR`, `maxHR`, `calories`, `aerobicTrainingEffect`, `anaerobicTrainingEffect`, `activityTrainingLoad`, `averageRunningCadenceInStepsPerMinute`

### Not confirmed from available primary sources

- Exact field names for start coordinates in activity _list_ payload (for example `startLatitude` / `startLongitude`) are **not** confirmed from the library's typed models or tests.
- Exact route/polyline field names in activity list payload are **not** confirmed.

### Inferred

- For this migration, treat `get_activities` output as summary/index metadata (id, type, timestamps, distance/duration), and expect route geometry from details/download endpoints rather than list rows.

### Sources

- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/__init__.py
- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/typed.py
- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/tests/test_typed.py

## Task 2: GPS Route Data for Heatmap

### Confirmed

- Per-activity details endpoint exists and is exposed as:
  - `get_activity_details(activity_id, maxchart=2000, maxpoly=4000)`
  - Request params are sent as `maxChartSize` and `maxPolylineSize` to `/activity-service/activity/{activity_id}/details`.
- Activity download endpoints are available via `download_activity(...)` in these formats:
  - `ORIGINAL`, `TCX`, `GPX`, `KML`, `CSV`
- Additional split endpoints are available but are not documented as full route geometry sources:
  - `/splits`, `/typedsplits`, `/split_summaries`

### Not confirmed from available primary sources

- Exact JSON key path for polyline in details response (for example names like `geoPolylineDTO` or equivalent) is **not** confirmed by the repository code/tests.
- Exact key names for point arrays/latitude-longitude arrays in details response are **not** confirmed.

### Inferred implementation strategy (low risk)

1. Use `get_activities(...)` for pagination and activity identifiers.
2. For each activity, call `get_activity_details(activity_id, maxpoly=...)` and inspect route fields.
3. If details route fields are absent/incomplete, fallback to `download_activity(..., GPX)` and parse GPX trackpoints.
4. Normalize to a stable internal route model before encoding to polyline for existing heatmap rendering.

This approach is resilient even if Garmin changes details JSON structure, because GPX export provides a fallback path.

### Sources

- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/__init__.py
- https://github.com/cyberjunky/python-garminconnect/pull/313

## Task 3: Garmin Connect API Rate Limits

### Confirmed

- Library behavior explicitly treats `429` as non-retryable/fail-fast:
  - mapped to `GarminConnectTooManyRequestsError`
  - retry logic is for transient network/5xx only
- Login flow has explicit user-facing message for `429`:
  - "Too many login attempts. Please wait a few minutes before trying again."

### Confirmed from community evidence (not official Garmin policy)

- Multiple issues report intermittent `429` during authentication/login flows.
- Maintainer guidance emphasizes token reuse instead of repeated fresh logins.

### Not confirmed

- No official Garmin-published numeric rate limits (requests per minute/hour/day) were found in the collected sources.

### Inferred operational guidance for migration

- Do not depend on fresh login for each sync run.
- Reuse stored session/token state whenever possible.
- Use incremental sync with checkpoints.
- Apply conservative pacing and exponential backoff with jitter for transient failures.
- Treat `429` as a backoff signal and reschedule instead of tight retry loops.

### Sources

- https://raw.githubusercontent.com/cyberjunky/python-garminconnect/master/garminconnect/__init__.py
- https://github.com/cyberjunky/python-garminconnect/pull/353
- https://github.com/cyberjunky/python-garminconnect/issues/337
- https://github.com/cyberjunky/python-garminconnect/issues/213

## Task 4: Python Azure Functions v2 on Azure Static Web Apps

### Confirmed

- Azure Static Web Apps managed APIs support Azure Functions with configurable runtime in `staticwebapp.config.json` via `platform.apiRuntime`.
- Supported `apiRuntime` values include Python options up to `python:3.11`.
- SWA API constraints include:
  - API route prefix must be `/api`
  - only HTTP requests are supported (no WebSocket)
  - max API request duration is 45 seconds
  - one backend API type per SWA environment

### Implication for this migration

- Python Azure Functions (v2 programming model on Functions runtime 4.x) is viable in managed SWA APIs, provided the app stays within managed API constraints above.

### Sources

- https://learn.microsoft.com/en-us/azure/static-web-apps/configuration#platform
- https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview
- https://learn.microsoft.com/en-us/azure/static-web-apps/add-api

## Task 5: proxies.json in Azure Static Web Apps

### Confirmed

- Azure Functions Proxies is a **legacy** feature (Functions runtime 1.x-3.x) and only temporarily re-enabled in v4 for migration scenarios.
- Legacy proxies are configured via `proxies.json` at function app root.
- Microsoft guidance is to move to Azure API Management for richer API proxy/routing behavior.

### Migration conclusion

- For SWA managed HTTP APIs and normal function routing, `proxies.json` is generally not required.
- Keep `proxies.json` only if there is an explicit legacy proxy behavior still needed and intentionally re-enabled; otherwise it is a cleanup candidate.

### Sources

- https://learn.microsoft.com/en-us/azure/azure-functions/functions-proxies
- https://learn.microsoft.com/en-us/previous-versions/azure/azure-functions/legacy-proxies
- https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview

## Summary Table

| Finding                                                                                                                          | Source                                                                   | Applies to                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Activity list field names confirmed for core metadata (`activityId`, `startTimeLocal`, `activityType.typeKey`, `distance`, etc.) | `typed.py`, `tests/test_typed.py`, `__init__.py` in python-garminconnect | Garmin-to-domain activity mapping in ingestion API                       |
| Start lat/lng key names are not confirmed in list payload                                                                        | Absence in typed model/tests and no explicit list schema in wrapper docs | Data model assumptions; avoid hard-coding unknown list coordinate fields |
| Route retrieval is supported via per-activity details (`maxPolylineSize`) and file export (`GPX`/`TCX`/etc.)                     | `__init__.py`, PR #313                                                   | Heatmap route extraction pipeline                                        |
| No official numeric Garmin limit found; 429 is common and should fail fast with backoff strategy                                 | `__init__.py`, PR #353, issues #337 and #213                             | Sync scheduling, retry policy, checkpointing                             |
| SWA managed APIs support Python runtime selection including `python:3.11`                                                        | SWA configuration/platform docs                                          | Hosting decision for migration backend                                   |
| SWA managed APIs are HTTP-only, `/api` prefixed, 45s max request                                                                 | SWA APIs overview                                                        | Endpoint design, long-running sync architecture                          |
| `proxies.json` belongs to legacy Functions Proxies; API Management is recommended for proxy scenarios                            | Functions proxies + legacy proxies docs                                  | Whether to keep/remove `api/proxies.json`                                |

## Notes on confidence

- Confirmed: directly evidenced by source code or Microsoft documentation links above.
- Inferred: implementation recommendations derived from confirmed behavior where field-level Garmin payload schema is not publicly specified.
