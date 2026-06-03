export interface Activity {
  id: string;
  source: string;
  name: string;
  activity_type: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  encoded_route: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  duration?: number;
  averageHR?: number;
  maxHR?: number;
  trainingEffect?: number;
  anaerobicTrainingEffect?: number;
  trainingEffectLabel?: string;
  activityTrainingLoad?: number;
}
