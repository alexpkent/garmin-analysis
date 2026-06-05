import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { Activity } from '../../types/Activity';
import moment from 'moment';

declare const Chart: any;

interface Series {
  label: string;
  valueKey: keyof Activity;
  color: string;
  /** Optional transform applied before aggregating (e.g. metres → miles) */
  transform?: (v: number) => number;
  hidden?: boolean;
}

@Component({
  selector: 'app-trend-chart',
  templateUrl: './trend-chart.component.html',
  styleUrls: ['./trend-chart.component.scss'],
  standalone: false
})
export class TrendChartComponent implements OnChanges, OnDestroy {
  @Input() activities: Activity[] = [];
  @Input() startDate: moment.Moment | null = null;
  @Input() endDate: moment.Moment | null = null;
  @Input() canGoBack = false;
  @Input() canGoForward = false;

  @Output() periodBack = new EventEmitter<void>();
  @Output() periodForward = new EventEmitter<void>();

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: any = null;
  periodLabel = '';

  readonly series: Series[] = [
    {
      label: 'Training Load',
      valueKey: 'activityTrainingLoad',
      color: '#ffc107'
    },
    {
      label: 'Training Effect',
      valueKey: 'trainingEffect',
      color: '#1FA87A'
    },
    {
      label: 'Anaerobic Effect',
      valueKey: 'anaerobicTrainingEffect',
      color: '#6A1B9A'
    },
    { label: 'Avg HR', valueKey: 'averageHR', color: '#42a5f5' },
    { label: 'Max HR', valueKey: 'maxHR', color: '#ef5350' },
    {
      label: 'Distance (mi)',
      valueKey: 'distance_meters',
      color: '#4caf50',
      transform: (v) => Math.round(v * 0.000621371 * 10) / 10
    },
    {
      label: 'Duration (min)',
      valueKey: 'moving_time_seconds',
      color: '#ff8c00',
      transform: (v) => Math.round(v / 60)
    }
  ];

  ngOnChanges(_: SimpleChanges): void {
    this.buildChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private buildChart(): void {
    const end = this.endDate
      ? this.endDate.clone().startOf('day')
      : moment().startOf('day');
    const start = this.startDate
      ? this.startDate.clone().startOf('day')
      : end.clone().subtract(364, 'days');

    this.periodLabel = `${start.format('MMM YYYY')} – ${end.format('MMM YYYY')}`;

    // Build weekly labels — each week is labelled by its Sunday (end of week)
    // so the last tick clearly shows the week containing today rather than the
    // preceding Monday (e.g. "7 Jun" instead of "1 Jun" when today is Thu 5 Jun).
    const labels: string[] = [];
    const cursor = start.clone().isoWeekday(1);
    if (cursor.isAfter(start)) cursor.subtract(7, 'days');
    while (cursor.isSameOrBefore(end, 'day')) {
      labels.push(cursor.clone().add(6, 'days').format('D MMM'));
      cursor.add(7, 'days');
    }

    // Aggregate activities per week bucket
    const weekCount = labels.length;
    const weekStart = start.clone().isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart.subtract(7, 'days');

    const buckets: Map<number, number[]>[] = this.series.map(() => new Map());

    for (const a of this.activities) {
      const date = moment(a.start_date).startOf('day');
      if (date.isBefore(start) || date.isAfter(end)) continue;
      const weekIdx = Math.floor(date.diff(weekStart, 'days') / 7);
      if (weekIdx < 0 || weekIdx >= weekCount) continue;

      this.series.forEach((s, si) => {
        const raw = a[s.valueKey];
        if (raw == null || typeof raw !== 'number') return;
        const val = s.transform ? s.transform(raw) : raw;
        const bucket = buckets[si];
        if (!bucket.has(weekIdx)) bucket.set(weekIdx, []);
        bucket.get(weekIdx)!.push(val);
      });
    }

    // Mean per week
    const datasets = this.series.map((s, si) => ({
      label: s.label,
      data: Array.from({ length: weekCount }, (_, i) => {
        const vals = buckets[si].get(i);
        if (!vals || vals.length === 0) return null;
        return (
          Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        );
      }),
      borderColor: s.color,
      backgroundColor: s.color + '22',
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      hidden: s.hidden ?? false,
      yAxisID: 'y'
    }));

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets = datasets;
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#adb5bd', boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: '#212529',
            titleColor: '#ffc107',
            bodyColor: '#dee2e6',
            borderColor: '#495057',
            borderWidth: 1,
            callbacks: {
              label: (ctx: any) => {
                if (ctx.parsed.y == null) return '';
                return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#6c757d',
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 14
            },
            grid: { color: '#2a2d31' }
          },
          y: {
            ticks: { color: '#6c757d' },
            grid: { color: '#2a2d31' },
            beginAtZero: true
          }
        }
      }
    });
  }
}
