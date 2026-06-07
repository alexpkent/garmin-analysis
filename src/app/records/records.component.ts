import { Component, OnInit } from '@angular/core';
import {
  ActivityService,
  PersonalRecord,
  RacePredictions,
  RecordsData
} from '../activity.service';
import { Activity } from '../types/Activity';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

@Component({
  selector: 'app-records',
  templateUrl: './records.component.html',
  styleUrls: ['./records.component.scss'],
  standalone: false
})
export class RecordsComponent implements OnInit {
  loading = true;
  loaded = false;
  data: RecordsData | null = null;
  activities: Activity[] = [];

  constructor(private activityService: ActivityService) {
    dayjs.extend(relativeTime);
  }

  ngOnInit(): void {
    Promise.all([
      this.activityService.getRecords(),
      this.activityService.getActivities()
    ]).then(([records, { activities }]) => {
      this.data = records;
      this.activities = activities;
      this.loading = false;
      this.loaded = true;
    });
  }

  get runningRecords(): PersonalRecord[] {
    return (this.data?.records ?? []).filter(
      (r) => r.activity_type === 'running'
    );
  }

  get cyclingRecords(): PersonalRecord[] {
    return (this.data?.records ?? []).filter(
      (r) => r.activity_type === 'cycling'
    );
  }

  get otherRecords(): PersonalRecord[] {
    return (this.data?.records ?? []).filter(
      (r) => r.activity_type !== 'running' && r.activity_type !== 'cycling'
    );
  }

  get swimmingRecords(): PersonalRecord[] {
    return (this.data?.records ?? []).filter(
      (r) => r.activity_type === 'lap_swimming'
    );
  }

  get predictions(): RacePredictions | null {
    return this.data?.race_predictions ?? null;
  }

  get countryRankings(): { code: string; name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const act of this.activities) {
      if (act.country) {
        counts.set(act.country, (counts.get(act.country) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, name: this.countryName(code), count }))
      .sort((a, b) => b.count - a.count);
  }

  flagEmoji(code: string): string {
    return [...code.toUpperCase()]
      .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
      .join('');
  }

  private countryName(code: string): string {
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  }

  formatTime(seconds: number | null | undefined): string {
    if (seconds == null) return '—';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  formatDistance(meters: number | null | undefined): string {
    if (meters == null) return '—';
    const miles = meters / 1609.344;
    if (miles >= 1) return `${miles.toFixed(2)} mi`;
    return `${Math.round(meters)} m`;
  }

  formatValue(record: PersonalRecord): string {
    if (record.value == null) return '—';
    if (record.unit === 'time') return this.formatTime(record.value);
    if (record.unit === 'distance') return this.formatDistance(record.value);
    return String(record.value);
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return dayjs(dateStr).format('D MMM YYYY');
  }

  timeSince(dateStr: string | null): string {
    if (!dateStr) return '';
    return dayjs(dateStr).fromNow();
  }

  garminUrl(activityId: string | null): string | null {
    if (!activityId) return null;
    return `https://connect.garmin.com/app/activity/${activityId}`;
  }

  /** Pace per mile from a timed distance record (running only) */
  pace(record: PersonalRecord): string {
    if (record.unit !== 'time' || record.value == null) return '';
    if (record.activity_type !== 'running') return '';
    // Map confirmed type_ids to distances in meters
    const distanceMap: Record<number, number> = {
      1: 1000, // 1K
      2: 1609.344, // 1 mile
      3: 5000, // 5K
      4: 10000, // 10K
      5: 21097.5, // half marathon
      6: 42195 // marathon
    };
    const dist = distanceMap[record.type_id];
    if (!dist) return '';
    const secsPerMile = (record.value / dist) * 1609.344;
    return this.formatTime(secsPerMile) + '/mi';
  }
}
