import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Activity } from './types/Activity';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  private cache: Promise<{ activities: Activity[]; syncError: boolean }> | null = null;

  constructor(private http: HttpClient) {}

  getActivities(): Promise<{ activities: Activity[]; syncError: boolean }> {
    if (!this.cache) {
      this.cache = this.http
        .get<Activity[]>('/api/activities', { observe: 'response' })
        .toPromise()
        .then(response => ({
          activities: (response?.body ?? []) as Activity[],
          syncError: response?.headers.get('X-Sync-Error') === 'true',
        }))
        .catch(err => {
          this.cache = null;
          throw err;
        });
    }
    return this.cache;
  }
}
