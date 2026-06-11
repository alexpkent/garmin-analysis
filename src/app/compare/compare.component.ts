import { Component, OnInit } from '@angular/core';
import { ActivityService, HealthSnapshot } from '../activity.service';
import { Activity } from '../types/Activity';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
import {
  METERS_PER_MILE,
  isRun,
  isRide,
  isFootball
} from '../utils/activity.utils';

export type Granularity = 'week' | 'month' | 'quarter' | 'year';

export interface ActivityMetric {
  source: 'activity';
  key: string;
  label: string;
  unit: string;
  aggregate: 'sum' | 'mean' | 'count';
  cumulative?: boolean;
  lowerIsBetter?: boolean;
  getValue: (a: Activity) => number | null;
}

export interface HealthMetric {
  source: 'health';
  key: string;
  label: string;
  unit: string;
  lowerIsBetter?: boolean;
  getValue: (s: HealthSnapshot) => number | null;
}

export type CompareMetric = ActivityMetric | HealthMetric;

export const ACTIVITY_COMPARE_METRICS: ActivityMetric[] = [
  {
    source: 'activity',
    key: 'distance',
    label: 'Distance',
    unit: 'mi',
    aggregate: 'sum',
    getValue: (a) =>
      a.distance_meters > 0 ? a.distance_meters / METERS_PER_MILE : null
  },
  {
    source: 'activity',
    key: 'distanceCumulative',
    label: 'Cumulative Distance',
    unit: 'mi',
    aggregate: 'sum',
    cumulative: true,
    getValue: (a) =>
      a.distance_meters > 0 ? a.distance_meters / METERS_PER_MILE : null
  },
  {
    source: 'activity',
    key: 'distanceCumulativeRun',
    label: 'Cumulative Distance – Running',
    unit: 'mi',
    aggregate: 'sum',
    cumulative: true,
    getValue: (a) =>
      isRun(a) && a.distance_meters > 0
        ? a.distance_meters / METERS_PER_MILE
        : null
  },
  {
    source: 'activity',
    key: 'distanceCumulativeCycle',
    label: 'Cumulative Distance – Cycling',
    unit: 'mi',
    aggregate: 'sum',
    cumulative: true,
    getValue: (a) =>
      isRide(a) && a.distance_meters > 0
        ? a.distance_meters / METERS_PER_MILE
        : null
  },
  {
    source: 'activity',
    key: 'distanceCumulativeFootball',
    label: 'Cumulative Distance – Football',
    unit: 'mi',
    aggregate: 'sum',
    cumulative: true,
    getValue: (a) =>
      isFootball(a) && a.distance_meters > 0
        ? a.distance_meters / METERS_PER_MILE
        : null
  },
  {
    source: 'activity',
    key: 'duration',
    label: 'Duration',
    unit: '',
    aggregate: 'sum',
    getValue: (a) =>
      a.moving_time_seconds > 0 ? a.moving_time_seconds / 60 : null
  },
  {
    source: 'activity',
    key: 'count',
    label: 'Activities',
    unit: '',
    aggregate: 'count',
    getValue: (_) => 1
  },
  {
    source: 'activity',
    key: 'avgHR',
    label: 'Avg HR',
    unit: 'bpm',
    aggregate: 'mean',
    lowerIsBetter: true,
    getValue: (a) => a.averageHR ?? null
  },
  {
    source: 'activity',
    key: 'maxHR',
    label: 'Max HR',
    unit: 'bpm',
    aggregate: 'mean',
    lowerIsBetter: true,
    getValue: (a) => a.maxHR ?? null
  },
  {
    source: 'activity',
    key: 'trainingEffect',
    label: 'Training Effect',
    unit: '',
    aggregate: 'mean',
    getValue: (a) => a.trainingEffect ?? null
  },
  {
    source: 'activity',
    key: 'anaerobicEffect',
    label: 'Anaerobic Effect',
    unit: '',
    aggregate: 'mean',
    getValue: (a) => a.anaerobicTrainingEffect ?? null
  },
  {
    source: 'activity',
    key: 'trainingLoad',
    label: 'Training Load',
    unit: '',
    aggregate: 'sum',
    getValue: (a) => a.activityTrainingLoad ?? null
  }
];

export const HEALTH_COMPARE_METRICS: HealthMetric[] = [
  {
    source: 'health',
    key: 'vo2maxRun',
    label: 'VO₂ Max (Run)',
    unit: '',
    getValue: (s) => s.vo2max_running
  },
  {
    source: 'health',
    key: 'vo2maxCycle',
    label: 'VO₂ Max (Cycle)',
    unit: '',
    getValue: (s) => s.vo2max_cycling
  },
  {
    source: 'health',
    key: 'restingHR',
    label: 'Resting HR',
    unit: 'bpm',
    lowerIsBetter: true,
    getValue: (s) => s.resting_hr
  },
  {
    source: 'health',
    key: 'readiness',
    label: 'Readiness',
    unit: '',
    getValue: (s) => s.training_readiness?.score ?? null
  }
];

export interface SummaryRow {
  metric: CompareMetric;
  valueA: number | null;
  valueB: number | null;
  delta: number | null;
  pct: number | null;
}

@Component({
  selector: 'app-compare',
  templateUrl: './compare.component.html',
  styleUrls: ['./compare.component.scss'],
  standalone: false
})
export class CompareComponent implements OnInit {
  loading = true;
  loaded = false;
  activities: Activity[] = [];
  healthSnapshots: HealthSnapshot[] = [];

  granularity: Granularity = 'year';

  yearA = dayjs().year() - 1;
  yearB = dayjs().year();
  quarterA = 1;
  quarterB = 1;
  monthA = 0;
  monthB = 0;
  weekA = 1;
  weekB = 1;

  selectedMetricKey = 'distance';

  readonly metrics: CompareMetric[] = [
    ...ACTIVITY_COMPARE_METRICS,
    ...HEALTH_COMPARE_METRICS
  ];

  readonly GRANULARITIES: { value: Granularity; label: string }[] = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' }
  ];

  readonly QUARTERS = [1, 2, 3, 4];
  readonly MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];
  weekOptions(year: number): { value: number; label: string }[] {
    return Array.from({ length: 52 }, (_, i) => {
      const w = i + 1;
      const s = dayjs(`${year}-01-04`).isoWeek(w).isoWeekday(1).startOf('day');
      const e = s.add(6, 'days');
      return {
        value: w,
        label: `W${w} · ${s.format('D MMM')} – ${e.format('D MMM')}`
      };
    });
  }

  constructor(private activityService: ActivityService) {}

  ngOnInit(): void {
    Promise.all([
      this.activityService.getActivities(),
      this.activityService.getHealth()
    ]).then(([{ activities }, snapshots]) => {
      this.activities = activities;
      this.healthSnapshots = snapshots;
      this.loading = false;
      this.loaded = true;

      const years = this.availableYears;
      if (years.length >= 2) {
        this.yearA = years[years.length - 2];
        this.yearB = years[years.length - 1];
      } else if (years.length === 1) {
        this.yearA = years[0];
        this.yearB = years[0];
      }

      const now = dayjs();
      this.quarterA = Math.floor(now.month() / 3) + 1;
      this.quarterB = this.quarterA;
      this.monthA = now.month();
      this.monthB = this.monthA;
      this.weekA = now.isoWeek();
      this.weekB = this.weekA;
    });
  }

  private filterSnapshots(start: Dayjs, end: Dayjs): HealthSnapshot[] {
    return this.healthSnapshots.filter((s) => {
      const d = dayjs(s.date);
      return d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day');
    });
  }

  get snapshotsA(): HealthSnapshot[] {
    return this.filterSnapshots(this.startA, this.endA);
  }

  get snapshotsB(): HealthSnapshot[] {
    return this.filterSnapshots(this.startB, this.endB);
  }

  get availableYears(): number[] {
    const yearSet = new Set<number>();
    for (const a of this.activities) {
      yearSet.add(dayjs(a.start_date).year());
    }
    return Array.from(yearSet).sort((a, b) => a - b);
  }

  get selectedMetric(): CompareMetric {
    return (
      this.metrics.find((m) => m.key === this.selectedMetricKey) ??
      this.metrics[0]
    );
  }

  setGranularity(g: Granularity): void {
    this.granularity = g;
  }

  private periodDates(
    year: number,
    quarter: number,
    month: number,
    week: number
  ): { start: Dayjs; end: Dayjs } {
    switch (this.granularity) {
      case 'year':
        return {
          start: dayjs(`${year}-01-01`).startOf('day'),
          end: dayjs(`${year}-12-31`).endOf('day')
        };
      case 'quarter': {
        const startMonth = (quarter - 1) * 3;
        const s = dayjs(`${year}-01-01`).month(startMonth).startOf('month');
        const e = s.add(3, 'months').subtract(1, 'day').endOf('day');
        return { start: s, end: e };
      }
      case 'month': {
        const s = dayjs(`${year}-01-01`).month(month).startOf('month');
        return { start: s, end: s.endOf('month') };
      }
      case 'week': {
        const s = dayjs(`${year}-01-04`)
          .isoWeek(week)
          .isoWeekday(1)
          .startOf('day');
        return { start: s, end: s.add(6, 'days').endOf('day') };
      }
    }
  }

  get startA(): Dayjs {
    return this.periodDates(this.yearA, this.quarterA, this.monthA, this.weekA)
      .start;
  }
  get endA(): Dayjs {
    return this.periodDates(this.yearA, this.quarterA, this.monthA, this.weekA)
      .end;
  }
  get startB(): Dayjs {
    return this.periodDates(this.yearB, this.quarterB, this.monthB, this.weekB)
      .start;
  }
  get endB(): Dayjs {
    return this.periodDates(this.yearB, this.quarterB, this.monthB, this.weekB)
      .end;
  }

  get labelA(): string {
    return this.periodLabel(this.yearA, this.quarterA, this.monthA, this.weekA);
  }
  get labelB(): string {
    return this.periodLabel(this.yearB, this.quarterB, this.monthB, this.weekB);
  }

  private periodLabel(
    year: number,
    quarter: number,
    month: number,
    week: number
  ): string {
    switch (this.granularity) {
      case 'year':
        return String(year);
      case 'quarter':
        return `Q${quarter} ${year}`;
      case 'month':
        return dayjs(`${year}-01-01`).month(month).format('MMMM YYYY');
      case 'week': {
        const { start, end } = this.periodDates(year, quarter, month, week);
        return `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`;
      }
    }
  }

  get activitiesA(): Activity[] {
    return this.filterActivities(this.startA, this.endA);
  }

  get activitiesB(): Activity[] {
    return this.filterActivities(this.startB, this.endB);
  }

  private filterActivities(start: Dayjs, end: Dayjs): Activity[] {
    return this.activities.filter((a) => {
      const d = dayjs(a.start_date);
      return d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day');
    });
  }

  private aggregateValue(
    acts: Activity[],
    snaps: HealthSnapshot[],
    metric: CompareMetric
  ): number | null {
    if (metric.source === 'health') {
      const vals = snaps
        .map((s) => metric.getValue(s))
        .filter((v): v is number => v != null);
      if (vals.length === 0) return null;
      return (
        Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      );
    }
    if (metric.aggregate === 'count')
      return acts.length > 0 ? acts.length : null;
    const vals: number[] = [];
    for (const a of acts) {
      const v = metric.getValue(a);
      if (v != null) vals.push(v);
    }
    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    if (metric.aggregate === 'sum') return Math.round(sum * 10) / 10;
    return Math.round((sum / vals.length) * 10) / 10;
  }

  get summaryRows(): SummaryRow[] {
    const actsA = this.activitiesA;
    const actsB = this.activitiesB;
    const snapsA = this.snapshotsA;
    const snapsB = this.snapshotsB;
    return this.metrics.map((m) => {
      const vA = this.aggregateValue(actsA, snapsA, m);
      const vB = this.aggregateValue(actsB, snapsB, m);
      const delta = vA != null && vB != null ? vB - vA : null;
      const pct =
        delta != null && vA != null && vA !== 0 ? (delta / vA) * 100 : null;
      return { metric: m, valueA: vA, valueB: vB, delta, pct };
    });
  }

  formatValue(v: number | null, metric: CompareMetric): string {
    if (v == null) return '—';
    if (metric.key === 'duration') {
      const totalMins = Math.round(v);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    const str = v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
    return metric.unit ? `${str} ${metric.unit}` : str;
  }

  formatDelta(pct: number | null, delta: number | null): string {
    if (delta == null) return '—';
    if (pct != null) {
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
  }

  deltaClass(delta: number | null, metric: CompareMetric): string {
    if (delta == null) return '';
    const positive = metric.lowerIsBetter ? delta < 0 : delta > 0;
    return positive ? 'delta-pos' : delta !== 0 ? 'delta-neg' : '';
  }
}
