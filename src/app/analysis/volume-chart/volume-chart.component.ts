import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
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
import { ACTIVITY_COLORS, UI_COLORS } from '../../constants/colors';
import {
  isRun,
  isRide,
  isFootball,
  activityIcon,
  formatDistance,
  getDuration
} from '../../utils/activity.utils';

declare const Chart: any;

@Component({
  selector: 'app-volume-chart',
  templateUrl: './volume-chart.component.html',
  styleUrls: ['./volume-chart.component.scss'],
  standalone: false
})
export class VolumeChartComponent implements OnChanges, OnDestroy {
  @Input() activities: Activity[] = [];
  @Input() startDate: Dayjs | null = null;
  @Input() endDate: Dayjs | null = null;
  @Input() canGoBack = false;
  @Input() canGoForward = false;

  @Output() periodBack = new EventEmitter<void>();
  @Output() periodForward = new EventEmitter<void>();

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private zone: NgZone) {}

  private chart: any = null;
  private touchDismissListener: ((e: TouchEvent) => void) | null = null;
  periodLabel = '';
  fullscreen = false;
  popupWeek: { label: string; activities: Activity[] } | null = null;
  private weekActivities: Activity[][] = [];
  private storedWeekLabels: string[] = [];

  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
    setTimeout(() => this.chart?.resize(), 0);
  }

  closePopup(): void {
    this.popupWeek = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.fullscreen) {
      this.fullscreen = false;
      setTimeout(() => this.chart?.resize(), 0);
    } else {
      this.closePopup();
    }
  }

  garminUrl(a: Activity): string {
    return `https://connect.garmin.com/app/activity/${a.id}`;
  }

  formatDistance(m: number): string {
    return formatDistance(m);
  }

  formatDuration(s: number): string {
    return getDuration(s);
  }

  activityIcon(a: Activity): string {
    return activityIcon(a);
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

    this.storedWeekLabels = weekLabels;
    this.weekActivities = Array.from({ length: weekCount }, () => []);

    const runData = new Array(weekCount).fill(0);
    const cycleData = new Array(weekCount).fill(0);
    const footballData = new Array(weekCount).fill(0);
    const otherData = new Array(weekCount).fill(0);

    for (const a of this.activities) {
      const d = dayjs(a.start_date).startOf('day');
      if (d.isBefore(start) || d.isAfter(end)) continue;
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      const miles = (a.distance_meters ?? 0) / 1609.344;
      if (isRun(a)) runData[idx] += miles;
      else if (isRide(a)) cycleData[idx] += miles;
      else if (isFootball(a)) footballData[idx] += miles;
      else otherData[idx] += miles;
      this.weekActivities[idx].push(a);
    }

    for (let i = 0; i < weekCount; i++) {
      runData[i] = Math.round(runData[i] * 10) / 10;
      cycleData[i] = Math.round(cycleData[i] * 10) / 10;
      footballData[i] = Math.round(footballData[i] * 10) / 10;
      otherData[i] = Math.round(otherData[i] * 10) / 10;
    }

    const datasets = [
      {
        label: 'Running',
        data: runData,
        backgroundColor: ACTIVITY_COLORS.run + '88',
        borderColor: ACTIVITY_COLORS.run,
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Cycling',
        data: cycleData,
        backgroundColor: ACTIVITY_COLORS.ride + '88',
        borderColor: ACTIVITY_COLORS.ride,
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Football',
        data: footballData,
        backgroundColor: ACTIVITY_COLORS.football + '88',
        borderColor: ACTIVITY_COLORS.football,
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Other',
        data: otherData,
        backgroundColor: ACTIVITY_COLORS.other + '88',
        borderColor: ACTIVITY_COLORS.other,
        borderWidth: 1,
        stack: 'volume'
      }
    ];

    if (this.chart) {
      const hiddenStates = datasets.map(
        (_: any, i: number) => this.chart.getDatasetMeta(i)?.hidden ?? false
      );
      this.chart.data.labels = weekLabels;
      this.chart.data.datasets = datasets;
      hiddenStates.forEach((hidden: boolean, i: number) => {
        this.chart.getDatasetMeta(i).hidden = hidden;
      });
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'bar',
      data: { labels: weekLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (_event: any, elements: any[]) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const acts = this.weekActivities[idx] ?? [];
          if (!acts.length) return;
          this.zone.run(() => {
            this.popupWeek = {
              label: this.storedWeekLabels[idx],
              activities: acts
            };
          });
        },
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
                if (!ctx.parsed.y) return '';
                return ` ${ctx.dataset.label}: ${ctx.parsed.y} mi`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: '#adb5bd',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            },
            grid: { color: '#2a2d31' }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { color: '#adb5bd' },
            grid: { color: '#2a2d31' },
            title: {
              display: true,
              text: 'Distance (mi)',
              color: '#adb5bd',
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
