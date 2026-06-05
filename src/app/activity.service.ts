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

export interface HealthSnapshot {
  date: string;
  vo2max_running: number | null;
  vo2max_cycling: number | null;
  training_status: string | null;
  load_focus: LoadFocus | null;
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
  private cache: Promise<{
    activities: Activity[];
    syncError: boolean;
  }> | null = null;
  private healthCache: Promise<HealthSnapshot[]> | null = null;
  private recordsCache: Promise<RecordsData | null> | null = null;

  /** Number of alert-level training insights — written by AnalysisComponent, read by NavComponent */
  trainingAlertCount = 0;

  constructor(private http: HttpClient) {}

  getActivities(): Promise<{ activities: Activity[]; syncError: boolean }> {
    if (!this.cache) {
      this.cache = this.http
        .get<Activity[]>('/api/activities', { observe: 'response' })
        .toPromise()
        .then((response) => ({
          activities: (response?.body ?? []) as Activity[],
          syncError: response?.headers.get('X-Sync-Error') === 'true'
        }))
        .catch((err) => {
          this.cache = null;
          throw err;
        });
    }
    return this.cache;
  }

  getHealth(): Promise<HealthSnapshot[]> {
    if (!this.healthCache) {
      this.healthCache = this.http
        .get<HealthSnapshot[]>('/api/health')
        .toPromise()
        .then((data) => data ?? [])
        .catch(() => []);
    }
    return this.healthCache;
  }

  getRecords(): Promise<RecordsData | null> {
    if (!this.recordsCache) {
      this.recordsCache = this.http
        .get<RecordsData>('/api/records')
        .toPromise()
        .then((data) => data ?? null)
        .catch(() => null);
    }
    return this.recordsCache;
  }
}
