import { Component, OnInit } from '@angular/core';
import { ActivityService } from '../activity.service';
import { Activity, formatTrainingEffectLabel } from '../types/Activity';
import {
  DaySelection,
  HeatmapBand
} from './calendar-heatmap/calendar-heatmap.component';
import { environment } from '../../environments/environment';
import moment from 'moment';

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
  latestActivity: Activity | null = null;

  // Period navigation
  private yearsBack = 0;
  periodEnd: moment.Moment = moment().startOf('day');
  periodStart: moment.Moment = moment().startOf('day').subtract(364, 'days');
  minActivityDate: moment.Moment | null = null;

  get periodLabel(): string {
    return `${this.periodStart.format('MMM YYYY')} – ${this.periodEnd.format('MMM YYYY')}`;
  }

  get canGoForward(): boolean {
    return this.yearsBack > 0;
  }

  get canGoBack(): boolean {
    return this.minActivityDate
      ? this.periodStart
          .clone()
          .subtract(1, 'day')
          .isSameOrAfter(this.minActivityDate, 'day')
      : false;
  }

  private updatePeriod(): void {
    this.periodEnd = moment().startOf('day').subtract(this.yearsBack, 'years');
    this.periodStart = this.periodEnd.clone().subtract(364, 'days');
  }

  goBack(): void {
    this.yearsBack++;
    this.updatePeriod();
  }

  goForward(): void {
    if (this.yearsBack > 0) {
      this.yearsBack--;
      this.updatePeriod();
    }
  }

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

  // Bands ordered by intensity (index = priority for cell colour)
  readonly trainingEffectBands: HeatmapBand[] = [
    { label: 'Recovery', min: 0, max: 0, color: '#1FA87A' },
    { label: 'Base (Low Aerobic)', min: 0, max: 0, color: '#1FA87A' },
    { label: 'Tempo (Low/Med Aerobic)', min: 0, max: 0, color: '#F57C00' },
    { label: 'Threshold', min: 0, max: 0, color: '#F57C00' },
    { label: 'VO₂ Max (High Aerobic)', min: 0, max: 0, color: '#F57C00' },
    { label: 'High Aerobic / Mixed', min: 0, max: 0, color: '#F57C00' },
    { label: 'Anaerobic Capacity', min: 0, max: 0, color: '#6A1B9A' },
    { label: 'Sprint (Anaerobic)', min: 0, max: 0, color: '#6A1B9A' },
    { label: 'Anaerobic (Overreaching)', min: 0, max: 0, color: '#6A1B9A' }
  ];

  readonly trainingEffectClassifier = (a: Activity): HeatmapBand | null => {
    const ae = a.trainingEffect ?? 0;
    const an = a.anaerobicTrainingEffect ?? 0;
    if (ae === 0 && an === 0) return null;

    // Use Garmin's own label as the primary classifier — it already encodes
    // the correct primary benefit (aerobic vs anaerobic dominant).
    const labelBandIndex: Record<string, number> = {
      NO_EFFECT: 0,
      RECOVERY: 0,
      RECOVERY_AEROBIC: 0,
      BASE: 1,
      AEROBIC_BASE: 1,
      TEMPO: 2,
      THRESHOLD: 3,
      VO2MAX: 4,
      HIGH_AEROBIC: 5,
      ANAEROBIC_CAPACITY: 6,
      SPRINT: 7,
      OVERREACHING: 8
    };
    if (
      a.trainingEffectLabel &&
      labelBandIndex[a.trainingEffectLabel] != null
    ) {
      return this.trainingEffectBands[labelBandIndex[a.trainingEffectLabel]];
    }

    // Fallback numeric thresholds (when label absent).
    // Garmin scale: 1=Minor, 2=Maintaining, 3=Improving, 4=Highly Improving, 5=Overreaching
    // Aerobic takes priority when it is the dominant score.
    if (ae >= an) {
      if (ae >= 5) return this.trainingEffectBands[8];
      if (ae >= 4) return this.trainingEffectBands[4];
      if (ae >= 3) return this.trainingEffectBands[3];
      if (ae >= 2) return this.trainingEffectBands[2];
      if (ae >= 1) return this.trainingEffectBands[1];
    }
    if (an >= 5) return this.trainingEffectBands[8];
    if (an >= 4) return this.trainingEffectBands[7];
    if (an >= 3) return this.trainingEffectBands[6];
    if (an >= 2) return this.trainingEffectBands[5];
    return this.trainingEffectBands[1];
  };

  // Max HR = 220 − age. Bands by % of expected max HR.
  private readonly tanakaMaxHr: number = (() => {
    const dob = new Date(environment.userDob);
    const now = new Date();
    const age =
      now.getFullYear() -
      dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())
        ? 1
        : 0);
    return 220 - age;
  })();

  readonly maxHrBands: HeatmapBand[] = [
    {
      label: 'Zone 1 – Warm-Up (50–60%)',
      min: Math.round(this.tanakaMaxHr * 0.5),
      max: Math.round(this.tanakaMaxHr * 0.6),
      color: '#9e9e9e'
    },
    {
      label: 'Zone 2 – Easy (60–70%)',
      min: Math.round(this.tanakaMaxHr * 0.6),
      max: Math.round(this.tanakaMaxHr * 0.7),
      color: '#42a5f5'
    },
    {
      label: 'Zone 3 – Aerobic (70–80%)',
      min: Math.round(this.tanakaMaxHr * 0.7),
      max: Math.round(this.tanakaMaxHr * 0.8),
      color: '#66bb6a'
    },
    {
      label: 'Zone 4 – Threshold (80–90%)',
      min: Math.round(this.tanakaMaxHr * 0.8),
      max: Math.round(this.tanakaMaxHr * 0.9),
      color: '#ffa726'
    },
    {
      label: 'Zone 5 – Maximum (90–100%)',
      min: Math.round(this.tanakaMaxHr * 0.9),
      max: Infinity,
      color: '#ef5350'
    }
  ];

  readonly maxHrClassifier = (a: Activity): HeatmapBand | null => {
    const hr = a.maxHR;
    if (hr == null || hr === 0) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  };

  readonly avgHrClassifier = (a: Activity): HeatmapBand | null => {
    const hr = a.averageHR;
    if (hr == null || hr === 0) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  };

  readonly distanceBands: HeatmapBand[] = [
    { label: 'Short (< 5 mi)', min: 0, max: 5, color: '#4caf50' },
    { label: 'Moderate (5–10 mi)', min: 5, max: 10, color: '#ffc107' },
    { label: 'Long (10–15 mi)', min: 10, max: 15, color: '#ff8c00' },
    { label: 'Very long (15+ mi)', min: 15, max: Infinity, color: '#e63419' }
  ];

  readonly distanceClassifier = (a: Activity): HeatmapBand | null => {
    const miles = (a.distance_meters ?? 0) * 0.000621371;
    if (miles === 0) return null;
    return (
      this.distanceBands.find((b) => miles >= b.min && miles < b.max) ?? null
    );
  };

  readonly durationBands: HeatmapBand[] = [
    { label: 'Short (< 30 min)', min: 0, max: 1800, color: '#4caf50' },
    { label: 'Moderate (30–60 min)', min: 1800, max: 3600, color: '#ffc107' },
    { label: 'Long (1–2 hrs)', min: 3600, max: 7200, color: '#ff8c00' },
    { label: 'Very long (2+ hrs)', min: 7200, max: Infinity, color: '#e63419' }
  ];

  readonly durationClassifier = (a: Activity): HeatmapBand | null => {
    const secs = a.moving_time_seconds ?? 0;
    if (secs === 0) return null;
    return (
      this.durationBands.find((b) => secs >= b.min && secs < b.max) ?? null
    );
  };

  constructor(private activityService: ActivityService) {}

  ngOnInit(): void {
    this.activityService
      .getActivities()
      .then(({ activities, syncError }) => {
        this.activities = activities;
        this.syncError = syncError;
        this.loading = false;
        this.loaded = true;
        if (activities.length > 0) {
          this.latestActivity = activities.reduce((latest, a) =>
            new Date(a.start_date) > new Date(latest.start_date) ? a : latest
          );
          this.minActivityDate = activities.reduce((earliest, a) => {
            const d = moment(a.start_date);
            return d.isBefore(earliest) ? d : earliest;
          }, moment(activities[0].start_date));
        }
      })
      .catch(() => {
        this.loading = false;
      });
  }

  closePopup(): void {
    this.selectedDay = null;
  }

  latestActivityIcon(a: Activity): string {
    const t = (a.activity_type ?? '').toLowerCase();
    if (t.includes('run')) return 'fas fa-running';
    if (t.includes('ride') || t.includes('cycl') || t.includes('bike'))
      return 'fas fa-biking';
    return 'fas fa-heartbeat';
  }

  latestDuration(a: Activity): string {
    const secs = a.duration ?? a.moving_time_seconds;
    if (!secs) return '';
    const hours = Math.floor(secs / 3600);
    const mins = Math.round((secs % 3600) / 60);
    if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
    if (hours > 0) return `${hours} hr`;
    return `${mins} mins`;
  }

  latestTrainingEffectBand(a: Activity): HeatmapBand | null {
    return this.trainingEffectClassifier(a);
  }

  latestDistanceBand(a: Activity): HeatmapBand | null {
    return this.distanceClassifier(a);
  }

  latestDurationBand(a: Activity): HeatmapBand | null {
    return this.durationClassifier(a);
  }

  latestHrBand(hr: number | undefined): HeatmapBand | null {
    if (!hr) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  }

  latestTrainingLoadBand(a: Activity): HeatmapBand | null {
    const v = a.activityTrainingLoad;
    if (v == null) return null;
    return this.trainingLoadBands.find((b) => v >= b.min && v < b.max) ?? null;
  }

  formatTeLabel(label: string | undefined): string {
    return formatTrainingEffectLabel(label);
  }

  garminUrl(activity: Activity): string {
    return `https://connect.garmin.com/app/activity/${activity.id}`;
  }

  activityValue(activity: Activity): number | null {
    if (!this.selectedDay || this.selectedDay.activityClassifier) return null;
    const v = activity[this.selectedDay.valueKey];
    return typeof v === 'number' ? v : null;
  }

  activityFormattedValue(activity: Activity): string | null {
    if (!this.selectedDay) return null;
    const key = this.selectedDay.valueKey;
    switch (key) {
      case 'trainingEffect': {
        const ae = activity.trainingEffect;
        const an = activity.anaerobicTrainingEffect;
        const parts: string[] = [];
        if (ae != null && ae > 0) parts.push(`Aerobic ${ae.toFixed(1)}`);
        if (an != null && an > 0) parts.push(`Anaerobic ${an.toFixed(1)}`);
        return parts.length ? parts.join(' · ') : null;
      }
      case 'averageHR': {
        const hr = activity.averageHR;
        return hr != null && hr > 0 ? `${Math.round(hr)} bpm` : null;
      }
      case 'maxHR': {
        const hr = activity.maxHR;
        return hr != null && hr > 0 ? `${Math.round(hr)} bpm` : null;
      }
      case 'distance_meters': {
        const miles = (activity.distance_meters ?? 0) / 1609.344;
        return miles > 0 ? `${miles.toFixed(1)} mi` : null;
      }
      case 'moving_time_seconds': {
        const secs = activity.duration ?? activity.moving_time_seconds;
        if (!secs) return null;
        const hours = Math.floor(secs / 3600);
        const mins = Math.round((secs % 3600) / 60);
        if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
        if (hours > 0) return `${hours} hr`;
        return `${mins} mins`;
      }
      case 'activityTrainingLoad': {
        const v = activity.activityTrainingLoad;
        return v != null ? `${Math.round(v)}` : null;
      }
      default:
        return null;
    }
  }

  activityBand(activity: Activity): HeatmapBand | null {
    if (!this.selectedDay) return null;
    if (this.selectedDay.activityClassifier) {
      return this.selectedDay.activityClassifier(activity);
    }
    const v = this.activityValue(activity);
    if (v == null) return null;
    return this.selectedDay.bands.find((b) => v >= b.min && v < b.max) ?? null;
  }

  activityIcon(activity: Activity): string {
    const t = activity.activity_type?.toLowerCase() ?? '';
    if (t.includes('run')) return 'fas fa-running';
    if (t.includes('cycling') || t.includes('ride') || t.includes('bike'))
      return 'fas fa-biking';
    return 'fas fa-heartbeat';
  }
}
