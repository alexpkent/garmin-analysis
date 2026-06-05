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
import { HealthSnapshot } from '../../activity.service';
import { Activity } from '../../types/Activity';
import moment from 'moment';

declare const Chart: any;

const TRAINING_STATUS_LABEL: Record<string, string> = {
  PRODUCTIVE: 'Productive',
  MAINTAINING: 'Maintaining',
  PEAKING: 'Peaking',
  RECOVERY: 'Recovery',
  UNPRODUCTIVE: 'Unproductive',
  OVERREACHING: 'Overreaching',
  DETRAINING: 'Detraining'
};

@Component({
  selector: 'app-health-trend-chart',
  templateUrl: './health-trend-chart.component.html',
  styleUrls: ['./health-trend-chart.component.scss'],
  standalone: false
})
export class HealthTrendChartComponent implements OnChanges, OnDestroy {
  @Input() snapshots: HealthSnapshot[] = [];
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

  formatStatus(phrase: string | null): string {
    if (!phrase) return 'No Status';
    const prefix = phrase.replace(/_\d+$/, '');
    return TRAINING_STATUS_LABEL[prefix] ?? phrase;
  }

  private buildChart(): void {
    const end = this.endDate ?? moment().startOf('day');
    const start =
      this.startDate ?? end.clone().subtract(364, 'days').startOf('day');

    this.periodLabel = `${start.format('MMM YYYY')} – ${end.format('MMM YYYY')}`;

    const filtered = this.snapshots
      .filter((s) => {
        const d = moment(s.date);
        return d.isSameOrAfter(start, 'day') && d.isSameOrBefore(end, 'day');
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Weekly HR aggregated from activities (same weekly-bucket approach as activity trends)
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
    const avgHrBuckets: Map<number, number[]> = new Map();
    const maxHrBuckets: Map<number, number[]> = new Map();
    for (const a of this.activities) {
      const d = moment(a.start_date).startOf('day');
      if (d.isBefore(start) || d.isAfter(end)) continue;
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      if (a.averageHR != null) {
        if (!avgHrBuckets.has(idx)) avgHrBuckets.set(idx, []);
        avgHrBuckets.get(idx)!.push(a.averageHR);
      }
      if (a.maxHR != null) {
        if (!maxHrBuckets.has(idx)) maxHrBuckets.set(idx, []);
        maxHrBuckets.get(idx)!.push(a.maxHR);
      }
    }
    const avgHrWeekly = Array.from({ length: weekCount }, (_, i) => {
      const vals = avgHrBuckets.get(i);
      if (!vals?.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    const maxHrWeekly = Array.from({ length: weekCount }, (_, i) => {
      const vals = maxHrBuckets.get(i);
      if (!vals?.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    // Bucket filtered snapshots into weekly slots
    const vo2Weekly: (number | null)[] = new Array(weekCount).fill(null);
    const lowAerobicWeekly: (number | null)[] = new Array(weekCount).fill(null);
    const highAerobicWeekly: (number | null)[] = new Array(weekCount).fill(
      null
    );
    const anaerobicWeekly: (number | null)[] = new Array(weekCount).fill(null);
    const lowTargetWeekly: (number | null)[] = new Array(weekCount).fill(null);
    const highTargetWeekly: (number | null)[] = new Array(weekCount).fill(null);

    for (const s of filtered) {
      const d = moment(s.date).startOf('day');
      const idx = Math.floor(d.diff(weekStart, 'days') / 7);
      if (idx < 0 || idx >= weekCount) continue;
      if (s.vo2max_running != null) vo2Weekly[idx] = s.vo2max_running;
      if (s.load_focus) {
        if (s.load_focus.low_aerobic_actual != null)
          lowAerobicWeekly[idx] = s.load_focus.low_aerobic_actual;
        if (s.load_focus.high_aerobic_actual != null)
          highAerobicWeekly[idx] = s.load_focus.high_aerobic_actual;
        if (s.load_focus.anaerobic_actual != null)
          anaerobicWeekly[idx] = s.load_focus.anaerobic_actual;
        const lMin = s.load_focus.low_aerobic_low,
          lMax = s.load_focus.low_aerobic_high;
        if (lMin != null && lMax != null)
          lowTargetWeekly[idx] = Math.round((lMin + lMax) / 2);
        const hMin = s.load_focus.high_aerobic_low,
          hMax = s.load_focus.high_aerobic_high;
        if (hMin != null && hMax != null)
          highTargetWeekly[idx] = Math.round((hMin + hMax) / 2);
      }
    }

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
        label: 'Avg HR',
        data: avgHrWeekly,
        borderColor: '#ef9a9a',
        backgroundColor: '#ef9a9a22',
        pointRadius: 2,
        pointHoverRadius: 5,
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
        label: 'Low Aerobic Load',
        data: lowAerobicWeekly,
        borderColor: '#1FA87A',
        backgroundColor: '#1FA87A22',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yLoad'
      },
      {
        label: 'Low Aerobic Target',
        data: lowTargetWeekly,
        borderColor: '#1FA87A',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        pointRadius: 0,
        borderWidth: 1,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yLoad'
      },
      {
        label: 'High Aerobic Load',
        data: highAerobicWeekly,
        borderColor: '#ffc107',
        backgroundColor: '#ffc10722',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yLoad'
      },
      {
        label: 'High Aerobic Target',
        data: highTargetWeekly,
        borderColor: '#ffc107',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        pointRadius: 0,
        borderWidth: 1,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yLoad'
      },
      {
        label: 'Anaerobic Load',
        data: anaerobicWeekly,
        borderColor: '#6A1B9A',
        backgroundColor: '#6A1B9A22',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        yAxisID: 'yLoad'
      }
    ];

    if (this.chart) {
      this.chart.data.labels = weekLabels;
      this.chart.data.datasets = datasets;
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
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            },
            grid: { color: '#2a2d31' }
          },
          yVo2: {
            type: 'linear',
            position: 'left',
            ticks: { color: '#42a5f5' },
            grid: { color: '#2a2d31' },
            title: {
              display: true,
              text: 'VO₂ Max',
              color: '#42a5f5',
              font: { size: 11 }
            }
          },
          yLoad: {
            type: 'linear',
            position: 'right',
            ticks: { color: '#adb5bd' },
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: 'Load',
              color: '#adb5bd',
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
          }
        }
      }
    });
  }
}
