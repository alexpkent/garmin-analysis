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

  private chart: any = null;
  periodLabel = '';

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
        backgroundColor: '#4caf5088',
        borderColor: '#4caf50',
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Cycling',
        data: cycleData,
        backgroundColor: '#42a5f588',
        borderColor: '#42a5f5',
        borderWidth: 1,
        stack: 'volume'
      },
      {
        label: 'Other',
        data: otherData,
        backgroundColor: '#ff8c0088',
        borderColor: '#ff8c00',
        borderWidth: 1,
        stack: 'volume'
      }
    ];

    if (this.chart) {
      this.chart.data.labels = weekLabels;
      this.chart.data.datasets = datasets;
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
