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
import { Activity } from '../../types/Activity';
import { HealthSnapshot } from '../../activity.service';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
import { UI_COLORS, STATUS_COLORS } from '../../constants/colors';

declare const Chart: any;

interface Series {
  label: string;
  valueKey: keyof Activity;
  color: string;
  yAxisID?: string;
  /** Optional transform applied before aggregating (e.g. metres → miles) */
  transform?: (v: number) => number;
  /** How to aggregate values in a week bucket — defaults to 'mean' */
  aggregate?: 'mean' | 'sum';
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
  @Input() snapshots: HealthSnapshot[] = [];
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

  readonly series: Series[] = [
    {
      label: 'Training Effect',
      valueKey: 'trainingEffect',
      color: '#1FA87A',
      yAxisID: 'yEffect'
    },
    {
      label: 'Anaerobic Effect',
      valueKey: 'anaerobicTrainingEffect',
      color: '#6A1B9A',
      yAxisID: 'yEffect'
    }
  ];

  ngOnChanges(_: SimpleChanges): void {
    this.buildChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    if (this.touchDismissListener) {
      document.removeEventListener('touchstart', this.touchDismissListener);
    }
  }

  private buildChart(): void {
    const end = this.endDate
      ? this.endDate.startOf('day')
      : dayjs().startOf('day');
    const start = this.startDate
      ? this.startDate.startOf('day')
      : end.subtract(364, 'days');

    this.periodLabel = `${start.format('MMM YYYY')} – ${end.format('MMM YYYY')}`;

    // Build weekly labels — each week is labelled by its Sunday (end of week)
    // so the last tick clearly shows the week containing today rather than the
    // preceding Monday (e.g. "7 Jun" instead of "1 Jun" when today is Thu 5 Jun).
    const labels: string[] = [];
    let cursor = start.isoWeekday(1);
    if (cursor.isAfter(start)) cursor = cursor.subtract(7, 'days');
    while (cursor.isSameOrBefore(end, 'day')) {
      labels.push(cursor.add(6, 'days').format('D MMM'));
      cursor = cursor.add(7, 'days');
    }

    // Aggregate activities per week bucket
    const weekCount = labels.length;
    let weekStart = start.isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart = weekStart.subtract(7, 'days');

    const buckets: Map<number, number[]>[] = this.series.map(() => new Map());

    for (const a of this.activities) {
      const date = dayjs(a.start_date).startOf('day');
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

    // Mean or sum per week depending on series aggregate setting
    const datasets: any[] = this.series.map((s, si) => ({
      label: s.label,
      data: Array.from({ length: weekCount }, (_, i) => {
        const vals = buckets[si].get(i);
        if (!vals || vals.length === 0) return null;
        const total = vals.reduce((a, b) => a + b, 0);
        if (s.aggregate === 'sum') return Math.round(total * 10) / 10;
        return Math.round((total / vals.length) * 10) / 10;
      }),
      borderColor: s.color,
      backgroundColor: s.color + '22',
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      hidden: s.hidden ?? false,
      yAxisID: s.yAxisID ?? 'y'
    }));

    // Load focus series from snapshots (hidden by default — toggle on for zone breakdown)
    const filteredSnaps = this.snapshots
      .filter((s) => {
        const d = dayjs(s.date).startOf('day');
        return !d.isBefore(start) && !d.isAfter(end);
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const lowAerobicW: (number | null)[] = new Array(weekCount).fill(null);
    const lowTargetW: (number | null)[] = new Array(weekCount).fill(null);
    const highAerobicW: (number | null)[] = new Array(weekCount).fill(null);
    const highTargetW: (number | null)[] = new Array(weekCount).fill(null);
    const anaerobicW: (number | null)[] = new Array(weekCount).fill(null);
    const anaerobicTargetW: (number | null)[] = new Array(weekCount).fill(null);

    for (const s of filteredSnaps) {
      const d = dayjs(s.date).startOf('day');
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      if (s.load_focus) {
        if (s.load_focus.low_aerobic_actual != null)
          lowAerobicW[idx] = s.load_focus.low_aerobic_actual;
        if (s.load_focus.high_aerobic_actual != null)
          highAerobicW[idx] = s.load_focus.high_aerobic_actual;
        if (s.load_focus.anaerobic_actual != null)
          anaerobicW[idx] = s.load_focus.anaerobic_actual;
        const lMin = s.load_focus.low_aerobic_low,
          lMax = s.load_focus.low_aerobic_high;
        if (lMin != null && lMax != null)
          lowTargetW[idx] = Math.round((lMin + lMax) / 2);
        const hMin = s.load_focus.high_aerobic_low,
          hMax = s.load_focus.high_aerobic_high;
        if (hMin != null && hMax != null)
          highTargetW[idx] = Math.round((hMin + hMax) / 2);
        const aMin = s.load_focus.anaerobic_low,
          aMax = s.load_focus.anaerobic_high;
        if (aMin != null && aMax != null)
          anaerobicTargetW[idx] = Math.round((aMin + aMax) / 2);
      }
    }

    const mkLoadDs = (
      label: string,
      data: (number | null)[],
      color: string,
      dashed = false
    ) => ({
      label,
      data,
      borderColor: color,
      backgroundColor: dashed ? 'transparent' : color + '22',
      ...(dashed ? { borderDash: [4, 4] } : {}),
      pointRadius: dashed ? 0 : 2,
      pointHoverRadius: dashed ? 0 : 5,
      borderWidth: dashed ? 1 : 2,
      tension: 0.3,
      spanGaps: true,
      hidden: false,
      yAxisID: 'y'
    });

    datasets.push(
      mkLoadDs('Low Aerobic Load', lowAerobicW, '#1FA87A'),
      mkLoadDs('Low Aerobic Target', lowTargetW, '#1FA87A', true),
      mkLoadDs('High Aerobic Load', highAerobicW, UI_COLORS.accent),
      mkLoadDs('High Aerobic Target', highTargetW, UI_COLORS.accent, true),
      mkLoadDs('Anaerobic Load', anaerobicW, '#6A1B9A'),
      mkLoadDs('Anaerobic Target', anaerobicTargetW, '#6A1B9A', true)
    );

    if (this.chart) {
      const hiddenStates = datasets.map(
        (_: any, i: number) => this.chart.getDatasetMeta(i)?.hidden ?? false
      );
      this.chart.data.labels = labels;
      this.chart.data.datasets = datasets;
      hiddenStates.forEach((hidden: boolean, i: number) => {
        this.chart.getDatasetMeta(i).hidden = hidden;
      });
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
            titleColor: UI_COLORS.accent,
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
            type: 'linear',
            position: 'left',
            ticks: { color: '#6c757d' },
            grid: { color: '#2a2d31' },
            beginAtZero: true
          },
          yEffect: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 5,
            ticks: {
              color: '#1FA87A',
              stepSize: 1
            },
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: 'Effect (0–5)',
              color: '#1FA87A',
              font: { size: 11 }
            }
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
}
