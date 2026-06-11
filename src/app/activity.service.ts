import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Activity } from './types/Activity';

export interface LoadFocus {
  low_aerobic_actual: number | null;
  low_aerobic_low: number | null;
  low_aerobic_high: number | null;
  high_aerobic_actual: number | null;
  high_aerobic_low: number | null;
  high_aerobic_high: number | null;
  anaerobic_actual: number | null;
  anaerobic_low: number | null;
  anaerobic_high: number | null;
  load_balance_phrase: string | null;
}

export interface TrainingReadiness {
  score: number | null;
  feedback: string | null;
}

export interface HealthSnapshot {
  date: string;
  vo2max_running: number | null;
  vo2max_cycling: number | null;
  training_status: string | null;
  load_focus: LoadFocus | null;
  resting_hr: number | null;
  training_readiness: TrainingReadiness | null;
}

export interface PersonalRecord {
  type_id: number;
  label: string;
  activity_type: string;
  activity_name: string | null;
  value: number | null;
  unit: 'time' | 'distance' | 'unknown';
  activity_id: string | null;
  date: string | null;
}

export interface RacePredictions {
  time_5k_seconds: number | null;
  time_10k_seconds: number | null;
  time_half_marathon_seconds: number | null;
  time_marathon_seconds: number | null;
}

export interface RecordsData {
  date: string;
  records: PersonalRecord[];
  race_predictions: RacePredictions | null;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  /** Number of alert-level training insights — written by AnalysisComponent, read by NavComponent */
  trainingAlertCount = 0;

  /** ISO timestamp of the last successful Garmin sync, from X-Last-Sync response header */
  lastSyncTime: string | null = null;

  constructor(private http: HttpClient) {}

  getActivities(): Promise<{ activities: Activity[]; syncError: boolean }> {
    return this.http
      .get<Activity[]>('/api/activities', { observe: 'response' })
      .toPromise()
      .then((response) => {
        const lastSync = response?.headers.get('X-Last-Sync');
        if (lastSync) {
          this.lastSyncTime = lastSync;
        }
        return {
          activities: (response?.body ?? []) as Activity[],
          syncError: response?.headers.get('X-Sync-Error') === 'true'
        };
      })
      .catch((err) => {
        throw err;
      });
  }

  getHealth(): Promise<HealthSnapshot[]> {
    return this.http
      .get<HealthSnapshot[]>('/api/health')
      .toPromise()
      .then((data) => data ?? [])
      .catch(() => []);
  }

  getRecords(): Promise<RecordsData | null> {
    return this.http
      .get<RecordsData>('/api/records')
      .toPromise()
      .then((data) => data ?? null)
      .catch(() => null);
  }
}
