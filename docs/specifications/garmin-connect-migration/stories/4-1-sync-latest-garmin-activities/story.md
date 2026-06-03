# US-1: Sync Latest Garmin Activities

**Wave:** 4
**Parallel Index:** 1
**Source:** US-1

---

## Description

As an athlete, I want my latest Garmin activities to be fetched when I open the app, so that my heatmap and training log always reflect my recent training

---

## Acceptance Criteria

- Given no activities have been previously synced, when the athlete opens the app, then all available Garmin activities are retrieved and available in the dashboard
- Given activities have been previously synced, when the athlete opens the app, then any Garmin activities not already present in the dashboard appear alongside existing activities, and no previously synced activity is duplicated
- Given Garmin Connect is unreachable when the athlete opens the app, then the athlete is shown an error indication that the sync failed; any previously stored activities remain visible, and if no activities have been previously stored the dashboard displays an empty state alongside the error

---

## Dependencies

- EN-1 → `1-1-python-api-scaffold`
- EN-2 → `2-1-blob-store-service`
- EN-3 → `3-1-garmin-client`
- EN-4 → `2-2-normalizer`
