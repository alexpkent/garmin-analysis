# US-2: View Activity Heatmap

**Wave:** 5
**Parallel Index:** 1
**Source:** US-2

---

## Description

As an athlete, I want to view all my activities on the heatmap regardless of whether they came from Garmin or Strava, so that I can see my complete training routes

---

## Acceptance Criteria

- Given Garmin activities with GPS route data have been synced, when the athlete views the heatmap, then Garmin activity routes appear as coloured lines on the map using the same colour scheme as the existing activity types
- Given historical Strava activities exist in storage, when the athlete views the heatmap, then their routes appear alongside Garmin activity routes with no visible distinction between sources
- Given an activity from either source has no GPS route data, when the heatmap is displayed, then that activity is included in the activity count totals but no route line is drawn for it

---

## Dependencies

- US-1 → `4-1-sync-latest-garmin-activities`
- EN-5 → `1-2-angular-activity-interface-and-service`
