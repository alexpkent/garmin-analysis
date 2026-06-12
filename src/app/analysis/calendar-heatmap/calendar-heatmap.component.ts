import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  EventEmitter,
  SimpleChanges,
  ViewChild,
  HostListener
} from '@angular/core';
import { Subscription, fromEvent } from 'rxjs';

import { Activity } from '../../types/Activity';
import { ScrollSyncService } from '../scroll-sync.service';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);

export interface DaySelection {
  dateLabel: string;
  activities: Activity[];
  valueKey: keyof Activity;
  valueLabel: string;
  bands: HeatmapBand[];
  activityClassifier?: (a: Activity) => HeatmapBand | null;
}

export interface HeatmapBand {
  label: string;
  min: number;
  max: number; // Infinity for the last band
  color: string;
}

interface DayCell {
  date: Dayjs;
  value: number | null;
  band: HeatmapBand | null;
  tooltip: string;
  activities: Activity[];
}

interface WeekColumn {
  days: (DayCell | null)[]; // index 0=Mon … 6=Sun
  monthLabel: string | null; // set on first week of a new month
}

@Component({
  selector: 'app-calendar-heatmap',
  templateUrl: './calendar-heatmap.component.html',
  styleUrls: ['./calendar-heatmap.component.scss'],
  standalone: false
})
export class CalendarHeatmapComponent implements OnInit, OnChanges, OnDestroy {
  @Input() title = '';
  @Input() activities: Activity[] = [];
  @Input() valueKey: keyof Activity = 'activityTrainingLoad';
  @Input() valueLabel = 'Value';
  @Input() bands: HeatmapBand[] = [];
  @Input() activityClassifier: ((a: Activity) => HeatmapBand | null) | null =
    null;
  @Input() startDate: Dayjs | null = null;
  @Input() endDate: Dayjs | null = null;
  @Input() canGoBack = false;
  @Input() canGoForward = false;

  @Output() daySelected = new EventEmitter<DaySelection>();
  @Output() periodBack = new EventEmitter<void>();
  @Output() periodForward = new EventEmitter<void>();

  @ViewChild('scrollEl', { static: true })
  scrollElRef!: ElementRef<HTMLElement>;

  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  weeks: WeekColumn[] = [];
  periodLabel = '';
  fullscreen = false;

  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.fullscreen) {
      this.fullscreen = false;
    }
  }

  private syncing = false;
  private subs = new Subscription();

  constructor(private scrollSync: ScrollSyncService) {}

  ngOnInit(): void {
    const el = this.scrollElRef.nativeElement;

    // Publish our scroll position to all peers
    this.subs.add(
      fromEvent(el, 'scroll').subscribe(() => {
        if (this.syncing) return;
        this.scrollSync.scroll$.next(el.scrollLeft);
      })
    );

    // Receive scroll positions from peers
    this.subs.add(
      this.scrollSync.scroll$.subscribe((pos) => {
        if (el.scrollLeft === pos) return;
        this.syncing = true;
        el.scrollLeft = pos;
        this.syncing = false;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  ngOnChanges(_: SimpleChanges): void {
    this.build();
  }

  private build(): void {
    const today = this.endDate
      ? this.endDate.startOf('day')
      : dayjs().startOf('day');
    const start = this.startDate
      ? this.startDate.startOf('day')
      : today.subtract(364, 'days');

    this.periodLabel = `${start.format('MMM YYYY')} – ${today.format('MMM YYYY')}`;

    // Build lookup: dateKey -> { total, maxBandIdx, acts }
    const dayMap = new Map<
      string,
      { total: number; maxBandIdx: number; acts: Activity[] }
    >();

    if (this.activityClassifier) {
      for (const a of this.activities) {
        const band = this.activityClassifier(a);
        if (!band) continue;
        const key = dayjs(a.start_date).format('YYYY-MM-DD');
        const entry = dayMap.get(key) ?? { total: 0, maxBandIdx: -1, acts: [] };
        entry.acts.push(a);
        const idx = this.bands.indexOf(band);
        if (idx > entry.maxBandIdx) entry.maxBandIdx = idx;
        dayMap.set(key, entry);
      }
    } else {
      for (const a of this.activities) {
        const raw = a[this.valueKey];
        if (raw == null || typeof raw !== 'number') continue;
        const key = dayjs(a.start_date).format('YYYY-MM-DD');
        const entry = dayMap.get(key) ?? { total: 0, maxBandIdx: -1, acts: [] };
        entry.total += raw;
        entry.acts.push(a);
        dayMap.set(key, entry);
      }
    }

    // Walk from Monday on/before start to today
    let cursor = start.isoWeekday(1);
    if (cursor.isAfter(start)) cursor = cursor.subtract(7, 'days');

    const columns: WeekColumn[] = [];
    let lastMonth = -1;

    while (cursor.isSameOrBefore(today, 'day')) {
      const col: WeekColumn = { days: [], monthLabel: null };

      for (let dow = 0; dow < 7; dow++) {
        const day = cursor.add(dow, 'days');
        if (day.isBefore(start) || day.isAfter(today)) {
          col.days.push(null);
        } else {
          const key = day.format('YYYY-MM-DD');
          const entry = dayMap.get(key) ?? null;
          let value: number | null;
          let band: HeatmapBand | null;
          if (this.activityClassifier) {
            band =
              entry && entry.maxBandIdx >= 0
                ? (this.bands[entry.maxBandIdx] ?? null)
                : null;
            value = band ? 1 : null;
          } else {
            value = entry?.total ?? null;
            band = value != null ? this.getBand(value) : null;
          }
          col.days.push({
            date: day,
            value,
            band,
            tooltip: this.makeTooltip(day, entry?.acts ?? []),
            activities: entry?.acts ?? []
          });
        }

        if (dow === 0) {
          const m = cursor.month();
          if (m !== lastMonth) {
            col.monthLabel = cursor.format('MMM');
            lastMonth = m;
          }
        }
      }

      columns.push(col);
      cursor = cursor.add(7, 'days');
    }

    this.weeks = columns;
  }

  private getBand(value: number): HeatmapBand | null {
    return this.bands.find((b) => value >= b.min && value < b.max) ?? null;
  }

  private formatActivityValue(a: Activity): string {
    switch (this.valueKey) {
      case 'trainingEffect': {
        const parts: string[] = [];
        if (a.trainingEffect != null && a.trainingEffect > 0)
          parts.push(`Aerobic ${a.trainingEffect.toFixed(1)}`);
        if (a.anaerobicTrainingEffect != null && a.anaerobicTrainingEffect > 0)
          parts.push(`Anaerobic ${a.anaerobicTrainingEffect.toFixed(1)}`);
        return parts.join(' · ');
      }
      case 'averageHR':
        return a.averageHR != null && a.averageHR > 0
          ? `${Math.round(a.averageHR)} bpm`
          : '';
      case 'maxHR':
        return a.maxHR != null && a.maxHR > 0
          ? `${Math.round(a.maxHR)} bpm`
          : '';
      case 'distance_meters': {
        const miles = (a.distance_meters ?? 0) / 1609.344;
        return miles > 0 ? `${miles.toFixed(1)} mi` : '';
      }
      case 'moving_time_seconds': {
        const secs = a.duration ?? a.moving_time_seconds;
        if (!secs) return '';
        const hours = Math.floor(secs / 3600);
        const mins = Math.round((secs % 3600) / 60);
        if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
        if (hours > 0) return `${hours} hr`;
        return `${mins} mins`;
      }
      case 'activityTrainingLoad':
        return a.activityTrainingLoad != null
          ? `${Math.round(a.activityTrainingLoad)}`
          : '';
      default:
        return '';
    }
  }

  private activityLine(a: Activity): string {
    const val = this.formatActivityValue(a);
    let band: HeatmapBand | null = null;
    if (this.activityClassifier) {
      band = this.activityClassifier(a);
    } else {
      const raw = a[this.valueKey];
      if (typeof raw === 'number') band = this.getBand(raw);
    }
    const parts: string[] = [a.name];
    if (val) parts.push(val);
    if (band) parts.push(`(${band.label})`);
    return parts.join(' – ');
  }

  private makeTooltip(day: Dayjs, acts: Activity[]): string {
    const dateStr = day.format('ddd D MMM YYYY');
    if (!acts.length) return `${dateStr}: no activity`;
    return [dateStr, ...acts.map((a) => this.activityLine(a))].join('\n');
  }

  cellColor(cell: DayCell | null): string {
    if (!cell || cell.value == null) return 'var(--cell-empty)';
    return cell.band?.color ?? 'var(--cell-empty)';
  }

  openCell(cell: DayCell): void {
    if (cell.activities.length === 0) return;
    this.daySelected.emit({
      dateLabel: cell.date.format('dddd D MMMM YYYY'),
      activities: cell.activities,
      valueKey: this.valueKey,
      valueLabel: this.valueLabel,
      bands: this.bands,
      activityClassifier: this.activityClassifier ?? undefined
    });
  }
}
