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
import { UI_COLORS } from '../../constants/colors';

declare const Chart: any;

// EMA time constants (TrainingPeaks standard exponential decay)
const K_CTL = 1 - Math.exp(-1 / 42); // Chronic Training Load – fitness (~42 days)
const K_ATL = 1 - Math.exp(-1 / 7); // Acute Training Load  – fatigue (~7 days)

@Component({
  selector: 'app-fitness-chart',
  templateUrl: './fitness-chart.component.html',
  styleUrls: ['./fitness-chart.component.scss'],
  standalone: false
})
export class FitnessChartComponent implements OnChanges, OnDestroy {
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
  fullscreen = false;

  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
    setTimeout(() => this.chart?.resize(), 0);
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

    // Build daily load map (sum all activities on the same calendar day)
    const loadMap = new Map<string, number>();
    for (const a of this.activities) {
      if (a.activityTrainingLoad == null) continue;
      const key = moment(a.start_date).format('YYYY-MM-DD');
      loadMap.set(key, (loadMap.get(key) ?? 0) + a.activityTrainingLoad);
    }

    // Build weekly labels (same week-boundary logic as other charts)
    const weekLabels: string[] = [];
    const wCursor = start.clone().isoWeekday(1);
    if (wCursor.isAfter(start)) wCursor.subtract(7, 'days');
    while (wCursor.isSameOrBefore(end, 'day')) {
      weekLabels.push(wCursor.clone().add(6, 'days').format('D MMM'));
      wCursor.add(7, 'days');
    }
    const weekCount = weekLabels.length;
    const weekStart = start.clone().isoWeekday(1);
    if (weekStart.isAfter(start)) weekStart.subtract(7, 'days');

    // Map each week-end date string → week index for O(1) lookup during daily walk
    const weekEndToIdx = new Map<string, number>();
    for (let i = 0; i < weekCount; i++) {
      weekEndToIdx.set(
        weekStart
          .clone()
          .add(i * 7 + 6, 'days')
          .format('YYYY-MM-DD'),
        i
      );
    }

    // Find earliest activity date so the EMA warms up properly
    let emaStart = end.clone();
    for (const a of this.activities) {
      const d = moment(a.start_date).startOf('day');
      if (d.isBefore(emaStart)) emaStart = d.clone();
    }

    // Walk day by day from emaStart, computing exponential moving averages
    const ctlData: (number | null)[] = new Array(weekCount).fill(null);
    const atlData: (number | null)[] = new Array(weekCount).fill(null);
    const tsbData: (number | null)[] = new Array(weekCount).fill(null);

    let ctl = 0;
    let atl = 0;
    const dayCursor = emaStart.clone();
    while (dayCursor.isSameOrBefore(end, 'day')) {
      const key = dayCursor.format('YYYY-MM-DD');
      const load = loadMap.get(key) ?? 0;
      ctl = ctl * (1 - K_CTL) + load * K_CTL;
      atl = atl * (1 - K_ATL) + load * K_ATL;

      const weekIdx = weekEndToIdx.get(key);
      if (weekIdx !== undefined) {
        ctlData[weekIdx] = Math.round(ctl * 10) / 10;
        atlData[weekIdx] = Math.round(atl * 10) / 10;
        tsbData[weekIdx] = Math.round((ctl - atl) * 10) / 10;
      }
      dayCursor.add(1, 'day');
    }

    const datasets = [
      {
        label: 'CTL (Fitness)',
        data: ctlData,
        borderColor: '#42a5f5',
        backgroundColor: '#42a5f522',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'y'
      },
      {
        label: 'ATL (Fatigue)',
        data: atlData,
        borderColor: '#ff8c00',
        backgroundColor: '#ff8c0022',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'y'
      },
      {
        label: 'Form (TSB)',
        data: tsbData,
        borderColor: '#ab47bc',
        backgroundColor: '#ab47bc22',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yTsb'
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
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { color: '#42a5f5' },
            grid: { color: '#2a2d31' },
            title: {
              display: true,
              text: 'Load',
              color: '#42a5f5',
              font: { size: 11 }
            }
          },
          yTsb: {
            type: 'linear',
            position: 'right',
            ticks: { color: '#ab47bc' },
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: 'Form (TSB)',
              color: '#ab47bc',
              font: { size: 11 }
            }
          }
        }
      }
    });
  }
}
