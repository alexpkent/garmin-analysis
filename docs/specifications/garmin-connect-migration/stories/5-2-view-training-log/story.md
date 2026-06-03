# US-3: View Training Log

**Wave:** 5
**Parallel Index:** 2
**Source:** US-3

---

## Description

As an athlete, I want the training log to display all my activities with consistent details regardless of source, so that I can review my complete training history

---

## Acceptance Criteria

- Given activities from both Strava and Garmin exist in storage, when the athlete views the training log, then all activities are displayed in reverse-chronological order with name, date, activity type, distance, and moving time shown for each
- Given a Garmin activity has been normalised to activity type "run" or "ride", when it is displayed in the training log, then the athlete sees a human-readable type label (e.g. "Run", "Ride") consistent with the labels used for Strava activities of the same type
- Given a historical Strava activity is displayed in the training log, when the athlete views it, then it shows the same fields as a Garmin activity with no indication that it originated from a different source

---

## Dependencies

- US-1 → `4-1-sync-latest-garmin-activities`
- EN-5 → `1-2-angular-activity-interface-and-service`
