import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Activity } from './types/Activity';

@Injectable({
  providedIn: 'root'
})
export class ActivityService {
  constructor(private http: HttpClient) {}

  async getActivities(): Promise<{
    activities: Activity[];
    syncError: boolean;
  }> {
    const response = await this.http
      .get<Activity[]>('/api/activities', { observe: 'response' })
      .toPromise();
    const syncError = response?.headers.get('X-Sync-Error') === 'true';
    return { activities: (response?.body ?? []) as Activity[], syncError };
  }
}
