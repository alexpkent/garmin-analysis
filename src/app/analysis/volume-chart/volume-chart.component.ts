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
  ViewChild
} from '@angular/core';
import { Activity } from '../../types/Activity';
import moment from 'moment';

declare const Chart: any;

@Component({
  selector: 'app-volume-chart',
  templateUrl: './volume-chart.component.html',
  styleUrls: ['./volume-chart.component.scss'],
  standalone: false
})
export class VolumeChartComponent implements OnChanges, OnDestroy {
  @Input() activities: Activity[] = [];
  @Input() startDate: moment.Moment | null = null;
  @Input() endDate: moment.Moment | null = null;
  @Input() canGoBack = false;
  @Input() canGoForward = false;

  @Output() periodBack = new EventEmitter<void>();
  @Output() periodForward = new EventEmitter<void>();

  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private zone: NgZone) {}

  private chart: any = null;
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

  garminUrl(a: Activity): string {
    return `https://connect.garmin.com/app/activity/${a.id}`;
  }

  formatDistance(m: number): string {
    return `${(m / 1609.344).toFixed(1)} mi`;
  }

  formatDuration(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  activityIcon(a: Activity): string {
    const t = a.activity_type?.toLowerCase() ?? '';
    if (t.includes('run')) return 'fas fa-running';
    if (t.includes('cycl') || t.includes('ride') || t.includes('bike'))
      return 'fas fa-bicycle';
    if (t.includes('swim')) return 'fas fa-swimmer';
    return 'fas fa-dumbbell';
  }

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

    // Build weekly labels
    const weekLabels: string[] = [];
    const cursor = start.clone().isoWeekday(1);
    if (cursor.isAfter(start)) cursor.subtract(7, 'days');
    while (cursor.isSameOrBefore(end, 'day')) {
      weekLabels.push(cursor.clone().add(6, 'days').format('D MMM'));
      cursor.add(7, 'days');
    }
    const weekCount = weekLabels.length;
    const weekStart = start.clone().isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart.subtract(7, 'days');

    this.storedWeekLabels = weekLabels;
    this.weekActivities = Array.from({ length: weekCount }, () => []);

    const runData = new Array(weekCount).fill(0);
    const cycleData = new Array(weekCount).fill(0);
    const otherData = new Array(weekCount).fill(0);

    for (const a of this.activities) {
      const d = moment(a.start_date).startOf('day');
      if (d.isBefore(start) || d.isAfter(end)) continue;
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      const miles = (a.distance_meters ?? 0) / 1609.344;
      const t = a.activity_type?.toLowerCase() ?? '';
      if (t.includes('run')) runData[idx] += miles;
      else if (t.includes('cycl') || t.includes('ride') || t.includes('bike'))
        cycleData[idx] += miles;
      else otherData[idx] += miles;
      this.weekActivities[idx].push(a);
    }

    for (let i = 0; i < weekCount; i++) {
      runData[i] = Math.round(runData[i] * 10) / 10;
      cycleData[i] = Math.round(cycleData[i] * 10) / 10;
      otherData[i] = Math.round(otherData[i] * 10) / 10;
    }

    const datasets = [
      {
        label: 'Running',
        data: runData,
        backgroundColor: '#FF604088',
        borderColor: '#FF6040',
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Cycling',
        data: cycleData,
        backgroundColor: '#40C8FF88',
        borderColor: '#40C8FF',
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Other',
        data: otherData,
        backgroundColor: '#FFC94088',
        borderColor: '#FFC940',
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
            titleColor: '#e8b84b',
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
              color: '#6c757d',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            },
            grid: { color: '#2a2d31' }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { color: '#6c757d' },
            grid: { color: '#2a2d31' },
            title: {
              display: true,
              text: 'Distance (mi)',
              color: '#6c757d',
              font: { size: 11 }
            }
          }
        }
      }
    });
  }
}
