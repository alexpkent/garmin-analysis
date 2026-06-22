import {
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  HostListener
} from '@angular/core';
import { Activity } from '../../types/Activity';
import { HealthSnapshot } from '../../activity.service';
import { CompareMetric, Granularity } from '../compare.component';
import dayjs, { Dayjs } from 'dayjs';
import { UI_COLORS } from '../../constants/colors';

declare const Chart: any;

const COLOR_A = UI_COLORS.accent;
const COLOR_B = '#4dabf7';

@Component({
  selector: 'app-compare-chart',
  templateUrl: './compare-chart.component.html',
  styleUrls: ['./compare-chart.component.scss'],
  standalone: false
})
export class CompareChartComponent implements OnChanges, OnDestroy {
  @Input() activitiesA: Activity[] = [];
  @Input() activitiesB: Activity[] = [];
  @Input() snapshotsA: HealthSnapshot[] = [];
  @Input() snapshotsB: HealthSnapshot[] = [];
  @Input() labelA = 'Period A';
  @Input() labelB = 'Period B';
  @Input() startA!: Dayjs;
  @Input() startB!: Dayjs;
  @Input() granularity: Granularity = 'year';
  @Input() metric!: CompareMetric;

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: any = null;
  private touchDismissListener: ((e: TouchEvent) => void) | null = null;
  fullscreen = false;

  constructor(private zone: NgZone) {}

  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
    setTimeout(() => this.chart?.resize(), 0);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.fullscreen) {
      this.fullscreen = false;
      setTimeout(() => this.chart?.resize(), 0);
    }
  }

  ngOnChanges(_: SimpleChanges): void {
    this.buildChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    if (this.touchDismissListener) {
      document.removeEventListener('touchstart', this.touchDismissListener);
    }
  }

  private bucketCount(start: Dayjs): number {
    switch (this.granularity) {
      case 'week':
        return 7;
      case 'month':
        return start.daysInMonth();
      case 'quarter':
        return 14;
      case 'year':
        return 53;
    }
  }

  private bucketIndex(date: Dayjs, start: Dayjs): number {
    const diffDays = date.startOf('day').diff(start.startOf('day'), 'days');
    if (diffDays < 0) return -1;
    switch (this.granularity) {
      case 'week':
      case 'month':
        return diffDays;
      case 'quarter':
      case 'year':
        return Math.floor(diffDays / 7);
    }
  }

  private xLabels(): string[] {
    switch (this.granularity) {
      case 'week':
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      case 'month': {
        // Use max days across both periods so the shorter one doesn't clip the other
        const days = Math.max(
          this.startA.daysInMonth(),
          this.startB.daysInMonth()
        );
        return Array.from({ length: days }, (_, i) =>
          i % 2 === 0 ? String(i + 1) : ''
        );
      }
      case 'quarter':
        // 14 relative weekly buckets
        return Array.from({ length: 14 }, (_, i) => `Wk ${i + 1}`);
      case 'year': {
        // 53 weekly buckets — month names anchored to period A (year comparisons
        // are typically calendar-aligned; tooltip shows both periods' actual dates)
        const labels: string[] = [];
        let lastMonth = -1;
        for (let i = 0; i < 53; i++) {
          const weekStart = this.startA.add(i * 7, 'days');
          const m = weekStart.month();
          labels.push(m !== lastMonth ? weekStart.format('MMM') : '');
          lastMonth = m;
        }
        return labels;
      }
    }
  }

  private bucketDateLabel(idx: number, start: Dayjs): string {
    switch (this.granularity) {
      case 'week':
        return start.add(idx, 'days').format('ddd D MMM');
      case 'month': {
        if (idx >= start.daysInMonth()) return '—';
        return start.date(idx + 1).format('D MMM YYYY');
      }
      case 'quarter':
      case 'year': {
        const weekStart = start.add(idx * 7, 'days');
        const weekEnd = weekStart.add(6, 'days');
        return `${weekStart.format('D MMM')} – ${weekEnd.format('D MMM YYYY')}`;
      }
    }
  }

  private buildActivityDataset(
    activities: Activity[],
    start: Dayjs
  ): (number | null)[] {
    if (!this.metric || !start) return [];
    const count = this.bucketCount(start);
    const buckets: number[][] = Array.from({ length: count }, () => []);

    for (const a of activities) {
      const date = dayjs(a.start_date);
      const idx = this.bucketIndex(date, start);
      if (idx < 0 || idx >= count) continue;
      if (this.metric.source !== 'activity') continue;
      const val = this.metric.getValue(a);
      if (val != null) buckets[idx].push(val);
    }

    const result = buckets.map((vals) => {
      if (vals.length === 0) return null;
      if (
        this.metric.source === 'activity' &&
        this.metric.aggregate === 'count'
      )
        return vals.length;
      const sum = vals.reduce((a, b) => a + b, 0);
      if (this.metric.source === 'activity' && this.metric.aggregate === 'sum')
        return Math.round(sum * 10) / 10;
      return Math.round((sum / vals.length) * 10) / 10;
    });

    if (this.metric.source === 'activity' && this.metric.cumulative) {
      let running = 0;
      return result.map((v) => {
        if (v != null) running = Math.round((running + v) * 10) / 10;
        return running > 0 ? running : null;
      });
    }

    return result;
  }

  private buildHealthDataset(
    snapshots: HealthSnapshot[],
    start: Dayjs
  ): (number | null)[] {
    if (!this.metric || !start || this.metric.source !== 'health') return [];
    const count = this.bucketCount(start);
    const buckets: number[][] = Array.from({ length: count }, () => []);

    for (const s of snapshots) {
      const date = dayjs(s.date);
      const idx = this.bucketIndex(date, start);
      if (idx < 0 || idx >= count) continue;
      const val = this.metric.getValue(s);
      if (val != null) buckets[idx].push(val);
    }

    return buckets.map((vals) => {
      if (vals.length === 0) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return Math.round((sum / vals.length) * 10) / 10;
    });
  }

  private buildChart(): void {
    if (!this.metric || !this.startA || !this.startB) return;

    const labels = this.xLabels();
    const isHealth = this.metric.source === 'health';
    const dataA = isHealth
      ? this.buildHealthDataset(this.snapshotsA, this.startA)
      : this.buildActivityDataset(this.activitiesA, this.startA);
    const dataB = isHealth
      ? this.buildHealthDataset(this.snapshotsB, this.startB)
      : this.buildActivityDataset(this.activitiesB, this.startB);
    const yTitle = this.metric.unit
      ? `${this.metric.label} (${this.metric.unit})`
      : this.metric.label;

    const datasets = [
      {
        label: this.labelA,
        data: dataA,
        borderColor: COLOR_A,
        backgroundColor: COLOR_A + '33',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2.5,
        tension: 0.3,
        spanGaps: true
      },
      {
        label: this.labelB,
        data: dataB,
        borderColor: COLOR_B,
        backgroundColor: COLOR_B + '33',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2.5,
        tension: 0.3,
        spanGaps: true
      }
    ];

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets = datasets;
      this.chart.options.scales['y'].title.text = yTitle;
      this.chart.update('none');
      return;
    }

    this.zone.runOutsideAngular(() => {
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
              labels: { color: '#adb5bd', boxWidth: 12, font: { size: 12 } }
            },
            tooltip: {
              backgroundColor: '#212529',
              titleColor: UI_COLORS.accent,
              bodyColor: '#dee2e6',
              borderColor: '#343a40',
              borderWidth: 1,
              callbacks: {
                title: (items: any[]) => {
                  const idx = items[0]?.dataIndex;
                  if (idx == null) return '';
                  const fmtA = this.bucketDateLabel(idx, this.startA);
                  const fmtB = this.bucketDateLabel(idx, this.startB);
                  if (fmtA === fmtB) return fmtA;
                  return [`${this.labelA}: ${fmtA}`, `${this.labelB}: ${fmtB}`];
                },
                label: (ctx: any) => {
                  const v = ctx.parsed.y;
                  if (v == null) return '';
                  const suffix = this.metric.unit ? ` ${this.metric.unit}` : '';
                  return ` ${ctx.dataset.label}: ${v}${suffix}`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#adb5bd',
                autoSkip: false,
                maxRotation: 45,
                minRotation: 45,
                font: { size: 11 }
              },
              grid: { color: '#343a40' }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#adb5bd', font: { size: 11 } },
              grid: { color: '#343a40' },
              title: {
                display: true,
                text: yTitle,
                color: '#adb5bd',
                font: { size: 11 }
              }
            }
          }
        }
      });

      // On touch devices, a tap outside the canvas should dismiss the tooltip.
      if (this.touchDismissListener) {
        document.removeEventListener('touchstart', this.touchDismissListener);
      }
      this.touchDismissListener = (e: TouchEvent) => {
        const canvas = this.canvasRef.nativeElement;
        if (!canvas.contains(e.target as Node)) {
          this.chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          this.chart.setDatasetVisibility(0, this.chart.isDatasetVisible(0));
          this.chart.update();
        }
      };
      document.addEventListener('touchstart', this.touchDismissListener, {
        passive: true
      });
    }); // end runOutsideAngular
  }
}
