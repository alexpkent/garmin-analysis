import { Component, OnInit } from '@angular/core';
import { ActivityService } from '../activity.service';
import { Activity } from '../types/Activity';
import {
  DaySelection,
  HeatmapBand
} from './calendar-heatmap/calendar-heatmap.component';

@Component({
  selector: 'app-analysis',
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.scss'],
  standalone: false
})
export class AnalysisComponent implements OnInit {
  activities: Activity[] = [];
  syncError = false;
  loading = true;
  loaded = false;
  selectedDay: DaySelection | null = null;

  readonly trainingLoadBands: HeatmapBand[] = [
    { label: 'Very easy / recovery (0–50)', min: 0, max: 50, color: '#4caf50' },
    { label: 'Easy–moderate (50–100)', min: 50, max: 100, color: '#ffc107' },
    { label: 'Moderate–hard (100–200)', min: 100, max: 200, color: '#ff8c00' },
    {
      label: 'Very hard / big stress (200+)',
      min: 200,
      max: Infinity,
      color: '#e63419'
    }
  ];

  constructor(private activityService: ActivityService) {}

  ngOnInit(): void {
    this.activityService
      .getActivities()
      .then(({ activities, syncError }) => {
        this.activities = activities;
        this.syncError = syncError;
        this.loading = false;
        this.loaded = true;
      })
      .catch(() => {
        this.loading = false;
      });
  }

  closePopup(): void {
    this.selectedDay = null;
  }

  activityValue(activity: Activity): number | null {
    if (!this.selectedDay) return null;
    const v = activity[this.selectedDay.valueKey];
    return typeof v === 'number' ? v : null;
  }

  activityBand(activity: Activity): HeatmapBand | null {
    if (!this.selectedDay) return null;
    const v = this.activityValue(activity);
    if (v == null) return null;
    return this.selectedDay.bands.find((b) => v >= b.min && v < b.max) ?? null;
  }

  garminUrl(activity: Activity): string {
    return `https://connect.garmin.com/app/activity/${activity.id}`;
  }

  activityIcon(activity: Activity): string {
    const t = activity.activity_type?.toLowerCase() ?? '';
    if (t.includes('run')) return 'fas fa-running';
    if (t.includes('cycling') || t.includes('ride') || t.includes('bike'))
      return 'fas fa-biking';
    return 'fas fa-heartbeat';
  }
}
