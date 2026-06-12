import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  HostListener
} from '@angular/core';
import { HealthSnapshot } from '../../activity.service';
import { Activity } from '../../types/Activity';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
import {
  TRAINING_STATUS_LABEL,
  TRAINING_STATUS_COLOR
} from '../../constants/heatmap-bands';
import { UI_COLORS } from '../../constants/colors';

declare const Chart: any;

@Component({
  selector: 'app-health-trend-chart',
  templateUrl: './health-trend-chart.component.html',
  styleUrls: ['./health-trend-chart.component.scss'],
  standalone: false
})
export class HealthTrendChartComponent implements OnChanges, OnDestroy {
  @Input() snapshots: HealthSnapshot[] = [];
  @Input() activities: Activity[] = [];
  @Input() startDate: Dayjs | null = null;
  @Input() endDate: Dayjs | null = null;
  @Input() canGoBack = false;
  @Input() canGoForward = false;

  @Output() periodBack = new EventEmitter<void>();
  @Output() periodForward = new EventEmitter<void>();

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: any = null;
  private touchDismissListener: ((e: TouchEvent) => void) | null = null;
  periodLabel = '';
  fullscreen = false;

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
  private statusLabels: (string | null)[] = [];

  ngOnChanges(_: SimpleChanges): void {
    this.buildChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    if (this.touchDismissListener) {
      document.removeEventListener('touchstart', this.touchDismissListener);
    }
  }

  formatStatus(phrase: string | null): string {
    if (!phrase) return 'No Status';
    const prefix = phrase.replace(/_\d+$/, '');
    return TRAINING_STATUS_LABEL[prefix] ?? phrase;
  }

  private buildChart(): void {
    const end = this.endDate ?? dayjs().startOf('day');
    const start = this.startDate ?? end.subtract(364, 'days').startOf('day');

    this.periodLabel = `${start.format('MMM YYYY')} – ${end.format('MMM YYYY')}`;

    const filtered = this.snapshots
      .filter((s) => {
        const d = dayjs(s.date);
        return d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day');
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Build weekly labels
    const weekLabels: string[] = [];
    let cursor = start.isoWeekday(1);
    if (cursor.isAfter(start)) cursor = cursor.subtract(7, 'days');
    while (cursor.isSameOrBefore(end, 'day')) {
      weekLabels.push(cursor.add(6, 'days').format('D MMM'));
      cursor = cursor.add(7, 'days');
    }
    const weekCount = weekLabels.length;
    let weekStart = start.isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart = weekStart.subtract(7, 'days');

    // Max HR and Avg HR from activities — peak / mean per week
    const maxHrBuckets: Map<number, number[]> = new Map();
    const avgHrBuckets: Map<number, number[]> = new Map();
    for (const a of this.activities) {
      const d = dayjs(a.start_date).startOf('day');
      if (d.isBefore(start) || d.isAfter(end)) continue;
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      if (a.maxHR != null) {
        if (!maxHrBuckets.has(idx)) maxHrBuckets.set(idx, []);
        maxHrBuckets.get(idx)!.push(a.maxHR);
      }
      if (a.averageHR != null) {
        if (!avgHrBuckets.has(idx)) avgHrBuckets.set(idx, []);
        avgHrBuckets.get(idx)!.push(a.averageHR);
      }
    }
    const maxHrWeekly = Array.from({ length: weekCount }, (_, i) => {
      const vals = maxHrBuckets.get(i);
      return vals?.length ? Math.max(...vals) : null;
    });
    const avgHrWeekly = Array.from({ length: weekCount }, (_, i) => {
      const vals = avgHrBuckets.get(i);
      if (!vals?.length) return null;
      return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    });

    // VO₂ Max, Resting HR, Training Status from snapshots
    const vo2Weekly: (number | null)[] = new Array(weekCount).fill(null);
    const rhrWeekly: (number | null)[] = new Array(weekCount).fill(null);
    const statusWeekly: (string | null)[] = new Array(weekCount).fill(null);

    for (const s of filtered) {
      const d = dayjs(s.date).startOf('day');
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      if (s.vo2max_running != null && s.vo2max_running > 0)
        vo2Weekly[idx] = s.vo2max_running;
      if (s.resting_hr != null) rhrWeekly[idx] = s.resting_hr;
      if (s.training_status != null) statusWeekly[idx] = s.training_status;
    }
    const vo2AxisRange = this.vo2AxisRange(vo2Weekly);

    // Compute status dot colours and labels from weekly status phrases
    this.statusLabels = statusWeekly.map((s) => {
      if (!s) return null;
      const prefix = s.replace(/_\d+$/, '');
      return TRAINING_STATUS_LABEL[prefix] ?? s;
    });
    const statusColors = statusWeekly.map((s) => {
      if (!s) return 'transparent';
      const prefix = s.replace(/_\d+$/, '');
      return TRAINING_STATUS_COLOR[prefix] ?? '#6c757d';
    });
    const statusDotData: (number | null)[] = statusWeekly.map((s) =>
      s ? 0.5 : null
    );

    const datasets = [
      {
        label: 'VO₂ Max',
        data: vo2Weekly,
        borderColor: '#42a5f5',
        backgroundColor: '#42a5f522',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yVo2'
      },
      {
        label: 'Resting HR',
        data: rhrWeekly,
        borderColor: '#ffd54f',
        backgroundColor: '#ffd54f22',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yHr'
      },
      {
        label: 'Max HR',
        data: maxHrWeekly,
        borderColor: '#ef5350',
        backgroundColor: '#ef535022',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yHr'
      },
      {
        label: 'Avg HR',
        data: avgHrWeekly,
        borderColor: '#ff8a65',
        backgroundColor: '#ff8a6522',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yHr'
      },
      {
        label: 'Training Status',
        data: statusDotData,
        pointBackgroundColor: statusColors,
        pointBorderColor: statusColors,
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 0,
        showLine: false,
        spanGaps: false,
        yAxisID: 'yStatus'
      }
    ];

    if (this.chart) {
      const hiddenStates = datasets.map(
        (_: any, i: number) => this.chart.getDatasetMeta(i)?.hidden ?? false
      );
      this.chart.data.labels = weekLabels;
      this.chart.data.datasets = datasets;
      this.chart.options.scales.yVo2.min = vo2AxisRange.min;
      this.chart.options.scales.yVo2.max = vo2AxisRange.max;
      hiddenStates.forEach((hidden: boolean, i: number) => {
        this.chart.getDatasetMeta(i).hidden = hidden;
      });
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: { labels: weekLabels, datasets },
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
            titleColor: UI_COLORS.accent,
            bodyColor: '#dee2e6',
            borderColor: '#495057',
            borderWidth: 1,
            callbacks: {
              label: (ctx: any) => {
                if (ctx.dataset.label === 'Training Status') {
                  const lbl = this.statusLabels[ctx.dataIndex];
                  return lbl ? ` Status: ${lbl}` : '';
                }
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
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            },
            grid: { color: '#2a2d31' }
          },
          yVo2: {
            type: 'linear',
            position: 'left',
            min: vo2AxisRange.min,
            max: vo2AxisRange.max,
            ticks: { color: '#42a5f5' },
            grid: { color: '#2a2d31' },
            title: {
              display: true,
              text: 'VO₂ Max',
              color: '#42a5f5',
              font: { size: 11 }
            }
          },
          yHr: {
            type: 'linear',
            position: 'right',
            ticks: { color: '#ef5350' },
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: 'HR (bpm)',
              color: '#ef5350',
              font: { size: 11 }
            }
          },
          yStatus: {
            type: 'linear',
            position: 'left',
            display: false,
            min: 0,
            max: 1
          }
        }
      }
    });

    if (this.touchDismissListener) {
      document.removeEventListener('touchstart', this.touchDismissListener);
    }
    this.touchDismissListener = (e: TouchEvent) => {
      if (!this.canvasRef.nativeElement.contains(e.target as Node)) {
        this.chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        this.chart.update();
      }
    };
    document.addEventListener('touchstart', this.touchDismissListener, {
      passive: true
    });
  }

  private vo2AxisRange(values: (number | null)[]): {
    min: number;
    max: number;
  } {
    const vo2Values = values.filter((v): v is number => v != null);
    if (vo2Values.length === 0) return { min: 30, max: 70 };

    const min = Math.min(...vo2Values);
    const max = Math.max(...vo2Values);
    const center = (min + max) / 2;
    const lower = Math.floor(center - 5);
    const upper = Math.ceil(center + 5);

    return {
      min: Math.max(0, lower),
      max: Math.max(upper, lower + 10)
    };
  }
}
