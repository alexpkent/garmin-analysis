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
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
import { ACTIVITY_COLORS } from '../../constants/colors';
import { isRun, isRide, isFootball } from '../../utils/activity.utils';

declare const Chart: any;

@Component({
  selector: 'app-cumulative-chart',
  templateUrl: './cumulative-chart.component.html',
  styleUrls: ['./cumulative-chart.component.scss'],
  standalone: false
})
export class CumulativeChartComponent implements OnChanges, OnDestroy {
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

    // Build weekly tick labels (week ending Sunday)
    const labels: string[] = [];
    let cursor = start.isoWeekday(1);
    if (cursor.isAfter(start)) cursor = cursor.subtract(7, 'days');
    while (cursor.isSameOrBefore(end, 'day')) {
      labels.push(cursor.add(6, 'days').format('D MMM'));
      cursor = cursor.add(7, 'days');
    }
    const weekCount = labels.length;
    let weekStart = start.isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart = weekStart.subtract(7, 'days');

    // Weekly distance per sport bucket (miles)
    const runWeekly = new Array(weekCount).fill(0);
    const rideWeekly = new Array(weekCount).fill(0);
    const footballWeekly = new Array(weekCount).fill(0);
    const otherWeekly = new Array(weekCount).fill(0);

    for (const a of this.activities) {
      const d = dayjs(a.start_date).startOf('day');
      if (d.isBefore(start) || d.isAfter(end)) continue;
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      const miles = (a.distance_meters ?? 0) * 0.000621371;
      if (isRun(a)) runWeekly[idx] += miles;
      else if (isRide(a)) rideWeekly[idx] += miles;
      else if (isFootball(a)) footballWeekly[idx] += miles;
      else otherWeekly[idx] += miles;
    }

    // Convert weekly buckets to cumulative totals
    const toCumulative = (weekly: number[]): number[] => {
      const cum: number[] = [];
      let total = 0;
      for (const v of weekly) {
        total += v;
        cum.push(Math.round(total * 10) / 10);
      }
      return cum;
    };

    const runCum = toCumulative(runWeekly);
    const rideCum = toCumulative(rideWeekly);
    const footballCum = toCumulative(footballWeekly);
    const otherCum = toCumulative(otherWeekly);
    const totalCum = runCum.map(
      (_, i) =>
        Math.round(
          (runCum[i] + rideCum[i] + footballCum[i] + otherCum[i]) * 10
        ) / 10
    );

    const datasets = [
      {
        label: 'Total',
        data: totalCum,
        borderColor: '#ffffff',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      },
      {
        label: 'Cycling',
        data: rideCum,
        borderColor: ACTIVITY_COLORS.ride,
        backgroundColor: ACTIVITY_COLORS.ride + '22',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      },
      {
        label: 'Running',
        data: runCum,
        borderColor: ACTIVITY_COLORS.run,
        backgroundColor: ACTIVITY_COLORS.run + '22',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      },
      {
        label: 'Football',
        data: footballCum,
        borderColor: ACTIVITY_COLORS.football,
        backgroundColor: ACTIVITY_COLORS.football + '22',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      },
      {
        label: 'Other',
        data: otherCum,
        borderColor: ACTIVITY_COLORS.other,
        backgroundColor: ACTIVITY_COLORS.other + '22',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false
      }
    ];

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
            titleColor: '#e8b84b',
            bodyColor: '#dee2e6',
            borderColor: '#495057',
            borderWidth: 1,
            callbacks: {
              label: (ctx: any) => {
                if (ctx.parsed.y == null) return '';
                return ` ${ctx.dataset.label}: ${ctx.parsed.y} mi`;
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
            beginAtZero: true,
            title: {
              display: true,
              text: 'Cumulative miles',
              color: '#6c757d',
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
