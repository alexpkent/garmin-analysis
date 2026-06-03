# EN-3: Garmin Client

**Wave:** 3
**Parallel Index:** 1
**Source:** EN-3

---

## Description

As a developer, I want a `GarminClient` that authenticates with Garmin Connect and stores tokens in blob storage, so that the function can fetch activities without interactive login

---

## Acceptance Criteria

- Given `GARMIN_EMAIL` and `GARMIN_PASSWORD` environment variables are set and no token blob exists, when `GarminClient` is initialised and `get_activities()` is called, then the client authenticates via Garmin SSO, stores the resulting tokens to `garmin/tokens.json`, and returns a list of activities
- Given a valid token blob exists in `garmin/tokens.json`, when `get_activities()` is called, then the client restores the token without re-entering credentials and auto-refreshes if expired
- Given Garmin Connect is unreachable, when `get_activities()` is called, then a `GarminConnectConnectionError` is raised and propagates to the caller

---

## Dependencies

- EN-1 → `1-1-python-api-scaffold`
- EN-2 → `2-1-blob-store-service`
