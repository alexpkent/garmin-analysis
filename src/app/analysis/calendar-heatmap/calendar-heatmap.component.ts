import {
  Component,
  Input,
  OnChanges,
  Output,
  EventEmitter,
  SimpleChanges
} from '@angular/core';
import { Activity } from '../../types/Activity';
import moment from 'moment';

export interface DaySelection {
  dateLabel: string;
  activities: Activity[];
  valueKey: keyof Activity;
  valueLabel: string;
  bands: HeatmapBand[];
}

export interface HeatmapBand {
  label: string;
  min: number;
  max: number; // Infinity for the last band
  color: string;
}

interface DayCell {
  date: moment.Moment;
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
export class CalendarHeatmapComponent implements OnChanges {
  @Input() title = '';
  @Input() activities: Activity[] = [];
  @Input() valueKey: keyof Activity = 'activityTrainingLoad';
  @Input() valueLabel = 'Value';
  @Input() bands: HeatmapBand[] = [];

  @Output() daySelected = new EventEmitter<DaySelection>();

  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  weeks: WeekColumn[] = [];
  periodLabel = '';

  ngOnChanges(_: SimpleChanges): void {
    this.build();
  }

  private build(): void {
    const today = moment().startOf('day');
    const start = today.clone().subtract(364, 'days'); // 365 days inclusive

    this.periodLabel = `${start.format('MMM YYYY')} – ${today.format('MMM YYYY')}`;

    // Build lookup: dateKey -> { total, activities }
    const dayMap = new Map<string, { total: number; acts: Activity[] }>();
    for (const a of this.activities) {
      const raw = a[this.valueKey];
      if (raw == null || typeof raw !== 'number') continue;
      const key = moment(a.start_date).format('YYYY-MM-DD');
      const entry = dayMap.get(key) ?? { total: 0, acts: [] };
      entry.total += raw;
      entry.acts.push(a);
      dayMap.set(key, entry);
    }

    // Walk from Monday on/before start to today
    const cursor = start.clone().isoWeekday(1);
    if (cursor.isAfter(start)) cursor.subtract(7, 'days');

    const columns: WeekColumn[] = [];
    let lastMonth = -1;

    while (cursor.isSameOrBefore(today, 'day')) {
      const col: WeekColumn = { days: [], monthLabel: null };

      for (let dow = 0; dow < 7; dow++) {
        const day = cursor.clone().add(dow, 'days');
        if (day.isBefore(start) || day.isAfter(today)) {
          col.days.push(null);
        } else {
          const key = day.format('YYYY-MM-DD');
          const entry = dayMap.get(key) ?? null;
          const value = entry?.total ?? null;
          col.days.push({
            date: day,
            value,
            band: value != null ? this.getBand(value) : null,
            tooltip: this.makeTooltip(day, value),
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
      cursor.add(7, 'days');
    }

    this.weeks = columns;
  }

  private getBand(value: number): HeatmapBand | null {
    return this.bands.find((b) => value >= b.min && value < b.max) ?? null;
  }

  private makeTooltip(day: moment.Moment, value: number | null): string {
    const dateStr = day.format('ddd D MMM YYYY');
    if (value == null) return `${dateStr}: no activity`;
    const band = this.getBand(value);
    return `${dateStr}: ${Math.round(value)}${band ? ' – ' + band.label : ''}`;
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
      bands: this.bands
    });
  }
}
