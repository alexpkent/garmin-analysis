# EN-5: Angular Activity Interface and Service

**Wave:** 1
**Parallel Index:** 2
**Source:** EN-5

---

## Description

As a developer, I want the Angular `Activity` interface and `ActivityService` updated to the unified schema, so that the frontend components can render Garmin and Strava activities with the same code

---

## Acceptance Criteria

- Given the existing `Activity` class in `src/app/types/Activity.ts`, when EN-5 is complete, then it is replaced with a flat TypeScript `interface Activity` containing `id: string`, `source: string`, `activity_type: string`, `start_date: string`, `distance_meters: number`, `moving_time_seconds: number`, `encoded_route: string | null`, `start_latitude: number | null`, and `start_longitude: number | null`
- Given the existing `strava.service.ts`, when EN-5 is complete, then it is renamed `activity.service.ts` and the class is renamed `ActivityService`; all component imports are updated
- Given `Map.ts` is used solely to type `Activity.map`, when EN-5 is complete, then `Map.ts` is deleted and its import removed from `Activity.ts`

---

## Dependencies

None
