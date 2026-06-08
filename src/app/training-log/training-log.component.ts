import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivityService } from '../activity.service';
import { Activity, formatTrainingEffectLabel } from '../types/Activity';
import { HeatmapBand } from '../analysis/calendar-heatmap/calendar-heatmap.component';
import { environment } from '../../environments/environment';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(isoWeek);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(relativeTime);
import { ACTIVITY_COLORS } from '../constants/colors';
import {
  DISTANCE_BANDS,
  DURATION_BANDS,
  TRAINING_LOAD_BANDS,
  TRAINING_EFFECT_BANDS,
  computeMaxHr,
  makeMaxHrBands
} from '../constants/heatmap-bands';
import {
  isRun,
  isRide,
  isFootball,
  isOtherActivity,
  distanceToMiles,
  getDuration,
  activityIcon,
  METERS_PER_MILE,
  SECONDS_PER_HOUR
} from '../utils/activity.utils';

interface NavMonth {
  month: number;
  monthName: string;
  weekKey: string;
}

interface NavYear {
  year: number;
  expanded: boolean;
  months: NavMonth[];
}

interface Summary {
  label: string;
  distance: number;
  seconds: number;
  runCount: number;
  rideCount: number;
  footballCount: number;
  otherCount: number;
}

interface DayData {
  date: Dayjs;
  activities: Activity[];
}

interface WeekData {
  weekKey: string;
  weekLabel: string;
  totalMiles: number;
  totalSeconds: number;
  isEmpty: boolean;
  runCount: number;
  rideCount: number;
  footballCount: number;
  otherCount: number;
  days: DayData[];
}

@Component({
  selector: 'app-training-log',
  templateUrl: './training-log.component.html',
  styleUrls: ['./training-log.component.scss'],
  standalone: false
})
export class TrainingLogComponent implements OnInit, OnDestroy {
  loading = false;
  loaded = false;
  syncError = false;

  activities: Activity[] = [];
  weekGroups: WeekData[] = [];
  maxActivityMiles = 1;

  selectedActivity: Activity | null = null;
  yearMonthNav: NavYear[] = [];
  activeNavKey = '';

  summaries: Summary[] = [];

  // ── Filter state ────────────────────────────────────────
  searchQuery = '';
  filterTypes: Set<string> = new Set(['run', 'ride', 'football', 'other']);

  get filteredWeekGroups(): WeekData[] {
    const q = this.searchQuery.trim().toLowerCase();
    const showRun = this.filterTypes.has('run');
    const showRide = this.filterTypes.has('ride');
    const showFootball = this.filterTypes.has('football');
    const showOther = this.filterTypes.has('other');

    // Fast path: no filtering active, avoid rebuilding the entire array tree.
    if (!q && showRun && showRide && showFootball && showOther) {
      return this.weekGroups;
    }

    return this.weekGroups
      .map((week) => ({
        ...week,
        days: week.days.map((day) => ({
          ...day,
          activities: day.activities.filter((a) => {
            const typeMatch =
              (this.isRun(a) && showRun) ||
              (this.isRide(a) && showRide) ||
              (this.isFootball(a) && showFootball) ||
              (this.isOtherActivity(a) && showOther);
            const nameMatch = !q || a.name.toLowerCase().includes(q);
            return typeMatch && nameMatch;
          })
        }))
      }))
      .filter(
        (week) => week.isEmpty || week.days.some((d) => d.activities.length > 0)
      );
  }

  get isFiltered(): boolean {
    return this.searchQuery.trim().length > 0 || this.filterTypes.size < 4;
  }

  toggleTypeFilter(type: string): void {
    if (this.filterTypes.has(type)) {
      if (this.filterTypes.size > 1) {
        this.filterTypes = new Set(this.filterTypes);
        this.filterTypes.delete(type);
      }
    } else {
      this.filterTypes = new Set(this.filterTypes);
      this.filterTypes.add(type);
    }
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.filterTypes = new Set(['run', 'ride', 'football', 'other']);
  }

  private scrollObserver: IntersectionObserver | null = null;
  private weekToNavKey = new Map<string, string>();
  private visibleWeeks = new Set<string>();
  private isProgrammaticScroll = false;
  private programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null;

  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  readonly runColor = ACTIVITY_COLORS.run;
  readonly rideColor = ACTIVITY_COLORS.ride;
  readonly footballColor = ACTIVITY_COLORS.football;
  readonly otherColor = ACTIVITY_COLORS.other;

  private readonly tanakaMaxHr: number = computeMaxHr();

  readonly distanceBands = DISTANCE_BANDS;
  readonly durationBands = DURATION_BANDS;
  readonly trainingLoadBands = TRAINING_LOAD_BANDS;
  readonly trainingEffectBands = TRAINING_EFFECT_BANDS;
  readonly maxHrBands = makeMaxHrBands(this.tanakaMaxHr);

  constructor(
    private activityService: ActivityService,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe,
    private zone: NgZone
  ) {}

  async exportActivities(): Promise<void> {
    const { activities } = await this.activityService.getActivities();
    const json = JSON.stringify(activities, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activities-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.scrollObserver?.disconnect();
    if (this.programmaticScrollTimer !== null) {
      clearTimeout(this.programmaticScrollTimer);
    }
  }

  private async load() {
    this.loading = true;
    const { activities, syncError } =
      await this.activityService.getActivities();
    this.activities = activities;
    this.syncError = syncError;
    this.buildWeekGroups();
    this.buildSummaries();
    this.buildYearMonthNav();
    this.loading = false;
    this.loaded = true;
    // Set up scroll observer after Angular renders the week rows
    setTimeout(() => {
      this.setupScrollObserver();
    }, 100);
  }

  private buildWeekGroups() {
    if (this.activities.length === 0) {
      this.weekGroups = [];
      return;
    }

    const sortedMiles = this.activities
      .map((a) => this.distanceToMiles(a.distance_meters))
      .filter((m) => m > 0)
      .sort((a, b) => a - b);
    const p95idx = Math.floor(sortedMiles.length * 0.95);
    this.maxActivityMiles =
      sortedMiles.length > 0
        ? Math.max(
            sortedMiles[p95idx] ?? sortedMiles[sortedMiles.length - 1],
            1
          )
        : 1;

    const weekMap = new Map<string, Activity[]>();
    for (const activity of this.activities) {
      const weekKey = dayjs(activity.start_date)
        .startOf('isoWeek')
        .format('YYYY-MM-DD');
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, []);
      }
      weekMap.get(weekKey)!.push(activity);
    }

    // Fill gaps so rest/recovery weeks appear as empty rows in the grid
    const allSortedKeys = Array.from(weekMap.keys()).sort();
    if (allSortedKeys.length > 1) {
      let cursor = dayjs(allSortedKeys[0]);
      const last = dayjs(allSortedKeys[allSortedKeys.length - 1]);
      while (cursor.isSameOrBefore(last)) {
        const k = cursor.format('YYYY-MM-DD');
        if (!weekMap.has(k)) {
          weekMap.set(k, []);
        }
        cursor = cursor.add(1, 'week');
      }
    }

    const weekKeys = Array.from(weekMap.keys()).sort().reverse();

    this.weekGroups = weekKeys.map((weekKey) => {
      const weekStart = dayjs(weekKey);
      const weekEnd = weekStart.endOf('isoWeek');
      const weekActivities = weekMap.get(weekKey)!;

      const days: DayData[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = weekStart.add(i, 'days');
        const dayActivities = weekActivities
          .filter((a) => dayjs(a.start_date).isSame(dayDate, 'day'))
          .sort(
            (a, b) =>
              dayjs(b.start_date).valueOf() - dayjs(a.start_date).valueOf()
          );
        days.push({ date: dayDate, activities: dayActivities });
      }

      const totalMiles = weekActivities.reduce(
        (sum, a) => sum + this.distanceToMiles(a.distance_meters),
        0
      );
      const totalSeconds = weekActivities.reduce(
        (sum, a) => sum + (a.duration ?? a.moving_time_seconds),
        0
      );
      return {
        weekKey,
        weekLabel: this.formatWeekLabel(weekStart, weekEnd),
        totalMiles,
        totalSeconds,
        isEmpty: weekActivities.length === 0,
        runCount: weekActivities.filter((a) => this.isRun(a)).length,
        rideCount: weekActivities.filter((a) => this.isRide(a)).length,
        footballCount: weekActivities.filter((a) => this.isFootball(a)).length,
        otherCount: weekActivities.filter((a) => this.isOtherActivity(a))
          .length,
        days
      };
    });
  }

  private formatWeekLabel(start: Dayjs, end: Dayjs): string {
    if (start.month() === end.month()) {
      return start.format('MMM D') + ' – ' + end.format('D');
    }
    return start.format('MMM D') + ' – ' + end.format('MMM D');
  }

  private buildSummaries() {
    const now = dayjs();
    const ranges = [
      { label: 'This Week', from: dayjs().startOf('isoWeek') },
      { label: 'This Month', from: dayjs().startOf('month') },
      { label: 'This Year', from: dayjs().startOf('year') },
      { label: 'All Time', from: dayjs(0) }
    ];

    this.summaries = ranges.map(({ label, from }) => {
      const filtered = this.activities.filter(
        (a) =>
          dayjs(a.start_date).isSameOrAfter(from) &&
          dayjs(a.start_date).isSameOrBefore(now)
      );
      return {
        label,
        distance: filtered.reduce((sum, a) => sum + a.distance_meters, 0),
        seconds: filtered.reduce(
          (sum, a) => sum + (a.duration ?? a.moving_time_seconds),
          0
        ),
        runCount: filtered.filter((a) => this.isRun(a)).length,
        rideCount: filtered.filter((a) => this.isRide(a)).length,
        footballCount: filtered.filter((a) => this.isFootball(a)).length,
        otherCount: filtered.filter((a) => this.isOtherActivity(a)).length
      };
    });
  }

  private buildYearMonthNav() {
    // Use actual activity dates (not week-start dates) so months like Nov/Dec
    // are never missed when their activities fall in a week that starts in an earlier month.
    // For each year+month, record the weekKey of the most-recent week that contains
    // an activity in that month (most-recent = highest weekKey string = top of the list).
    const monthBestWeek = new Map<string, string>(); // "YYYY-M" -> weekKey

    for (const activity of this.activities) {
      const d = dayjs(activity.start_date);
      const mapKey = `${d.year()}-${d.month()}`; // month is 0-indexed
      const weekKey = d.startOf('isoWeek').format('YYYY-MM-DD');
      const current = monthBestWeek.get(mapKey);
      if (!current || weekKey > current) {
        monthBestWeek.set(mapKey, weekKey);
      }
    }

    // Group into years
    const yearMap = new Map<number, Map<number, string>>();
    for (const [mapKey, weekKey] of monthBestWeek) {
      const dashIdx = mapKey.indexOf('-');
      const year = parseInt(mapKey.substring(0, dashIdx), 10);
      const month = parseInt(mapKey.substring(dashIdx + 1), 10);
      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      yearMap.get(year)!.set(month, weekKey);
    }

    const currentYear = dayjs().year();
    const years = Array.from(yearMap.keys()).sort().reverse();
    this.yearMonthNav = years.map((year) => {
      const monthMap = yearMap.get(year)!;
      const months = Array.from(monthMap.keys())
        .sort((a, b) => a - b)
        .reverse()
        .map((month) => ({
          month,
          monthName: dayjs().month(month).format('MMM'),
          weekKey: monthMap.get(month)!
        }));
      return { year, expanded: year === currentYear, months };
    });

    if (
      this.yearMonthNav.length > 0 &&
      this.yearMonthNav[0].months.length > 0
    ) {
      this.activeNavKey = this.yearMonthNav[0].months[0].weekKey;
    }

    // Build weekKey -> navMonth.weekKey lookup for scroll-spy
    this.weekToNavKey.clear();
    for (const week of this.weekGroups) {
      const d = dayjs(week.weekKey);
      let navKey = this.findNavKey(d.year(), d.month());
      if (!navKey) {
        // Week spans two months; try the end date's month
        const endD = d.add(6, 'days');
        navKey = this.findNavKey(endD.year(), endD.month());
      }
      if (navKey) {
        this.weekToNavKey.set(week.weekKey, navKey);
      }
    }
  }

  private findNavKey(year: number, month: number): string | null {
    const navYear = this.yearMonthNav.find((y) => y.year === year);
    if (!navYear) {
      return null;
    }
    const navMonth = navYear.months.find((m) => m.month === month);
    return navMonth ? navMonth.weekKey : null;
  }

  private setActiveNav(navKey: string) {
    if (this.activeNavKey === navKey) {
      return;
    }
    this.activeNavKey = navKey;
    // Auto-expand the year that owns this key
    for (const navYear of this.yearMonthNav) {
      if (navYear.months.some((m) => m.weekKey === navKey)) {
        if (!navYear.expanded) {
          navYear.expanded = true;
        }
        break;
      }
    }
    this.scrollNavToActive();
  }

  private scrollNavToActive() {
    setTimeout(() => {
      // Desktop sidebar
      const activeBtn = document.querySelector(
        '.nav-month-active'
      ) as HTMLElement | null;
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'nearest' });
      }
      // Mobile horizontal strip
      const activeChip = document.querySelector(
        '.mobile-month-chip--active'
      ) as HTMLElement | null;
      if (activeChip) {
        activeChip.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }
    }, 0);
  }

  private setupScrollObserver() {
    this.scrollObserver?.disconnect();
    this.visibleWeeks.clear();

    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const weekKey = (entry.target as HTMLElement).id.replace('week-', '');
          if (entry.isIntersecting) {
            this.visibleWeeks.add(weekKey);
          } else {
            this.visibleWeeks.delete(weekKey);
          }
        }
        // Ignore scroll-spy updates while we are programmatically scrolling to a month
        if (this.isProgrammaticScroll) {
          return;
        }
        // weekGroups is newest-first (= top of page first); pick the topmost visible week
        const topmostVisible = this.weekGroups.find((w) =>
          this.visibleWeeks.has(w.weekKey)
        );
        if (topmostVisible) {
          const navKey = this.weekToNavKey.get(topmostVisible.weekKey);
          if (navKey) {
            this.zone.run(() => {
              this.setActiveNav(navKey);
            });
          }
        }
      },
      { threshold: 0 }
    );

    const weekRows = document.querySelectorAll('[id^="week-"]');
    weekRows.forEach((el) => this.scrollObserver!.observe(el));
  }

  toggleNavYear(year: number) {
    const nav = this.yearMonthNav.find((y) => y.year === year);
    if (!nav) {
      return;
    }
    nav.expanded = !nav.expanded;
    if (nav.expanded && nav.months.length > 0) {
      // Scroll to the newest (topmost) month of this year after Angular renders months
      setTimeout(() => {
        this.scrollToMonth(nav.months[0].weekKey);
      }, 0);
    }
  }

  scrollToMonth(weekKey: string) {
    this.activeNavKey = weekKey;
    // Ensure the year containing this weekKey is expanded
    for (const navYear of this.yearMonthNav) {
      if (navYear.months.some((m) => m.weekKey === weekKey)) {
        if (!navYear.expanded) {
          navYear.expanded = true;
        }
        break;
      }
    }
    // Suppress scroll-spy while the smooth scroll animation runs
    if (this.programmaticScrollTimer !== null) {
      clearTimeout(this.programmaticScrollTimer);
    }
    this.isProgrammaticScroll = true;
    const el = document.getElementById('week-' + weekKey);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    this.scrollNavToActive();
    // Re-enable scroll-spy after the smooth scroll animation completes (~800 ms)
    this.programmaticScrollTimer = setTimeout(() => {
      this.isProgrammaticScroll = false;
      this.programmaticScrollTimer = null;
    }, 800);
  }

  distanceFillPercent(activity: Activity): number {
    const miles = this.distanceToMiles(activity.distance_meters);
    if (miles <= 0) {
      return 0;
    }
    const relativeWidth =
      (Math.min(miles, this.maxActivityMiles) / this.maxActivityMiles) * 100;
    return Math.round(relativeWidth);
  }

  onBubbleClick(activity: Activity) {
    this.selectedActivity = activity;
  }

  closeModal() {
    this.selectedActivity = null;
  }

  activityColor(activity: Activity): string {
    if (this.isRun(activity)) {
      return this.runColor;
    }
    if (this.isRide(activity)) {
      return this.rideColor;
    }
    if (this.isFootball(activity)) {
      return this.footballColor;
    }
    return this.otherColor;
  }

  activityIcon(activity: Activity): string {
    return activityIcon(activity);
  }

  isRun(activity: Activity): boolean {
    return isRun(activity);
  }
  isRide(activity: Activity): boolean {
    return isRide(activity);
  }
  isFootball(activity: Activity): boolean {
    return isFootball(activity);
  }
  isOtherActivity(activity: Activity): boolean {
    return isOtherActivity(activity);
  }

  formatActivityType(type: string): string {
    const labels: Record<string, string> = {
      run: 'Run',
      ride: 'Ride',
      swim: 'Swim',
      walk: 'Walk',
      other: 'Other'
    };
    return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
  }

  distanceToMiles(meters: number): number {
    return distanceToMiles(meters);
  }
  secondsToHours(seconds: number): number {
    return seconds / SECONDS_PER_HOUR;
  }
  getDuration(durationInSeconds: number): string {
    return getDuration(durationInSeconds);
  }

  getTimeSince(startDate: string): string {
    return dayjs(startDate).fromNow();
  }

  formatTrainingEffectLabel(label: string | undefined | null): string {
    return formatTrainingEffectLabel(label);
  }

  latestActivityIcon(a: Activity): string {
    return activityIcon(a);
  }

  garminUrl(activity: Activity): string {
    return `https://connect.garmin.com/app/activity/${activity.id}`;
  }

  latestDistanceBand(a: Activity): HeatmapBand | null {
    const miles = distanceToMiles(a.distance_meters ?? 0);
    if (miles === 0) return null;
    return (
      this.distanceBands.find((b) => miles >= b.min && miles < b.max) ?? null
    );
  }

  latestDurationBand(a: Activity): HeatmapBand | null {
    const secs = a.duration ?? a.moving_time_seconds ?? 0;
    if (secs === 0) return null;
    return (
      this.durationBands.find((b) => secs >= b.min && secs < b.max) ?? null
    );
  }

  latestHrBand(hr: number | undefined): HeatmapBand | null {
    if (!hr) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  }

  latestTrainingEffectBand(a: Activity): HeatmapBand | null {
    const ae = a.trainingEffect ?? 0;
    const an = a.anaerobicTrainingEffect ?? 0;
    if (ae === 0 && an === 0) return null;
    const labelBandIndex: Record<string, number> = {
      NO_EFFECT: 0,
      RECOVERY: 0,
      RECOVERY_AEROBIC: 0,
      BASE: 1,
      AEROBIC_BASE: 1,
      TEMPO: 2,
      THRESHOLD: 3,
      VO2MAX: 4,
      HIGH_AEROBIC: 5,
      ANAEROBIC_CAPACITY: 6,
      SPRINT: 7,
      OVERREACHING: 8
    };
    if (
      a.trainingEffectLabel &&
      labelBandIndex[a.trainingEffectLabel] != null
    ) {
      return this.trainingEffectBands[labelBandIndex[a.trainingEffectLabel]];
    }
    if (ae >= an) {
      if (ae >= 5) return this.trainingEffectBands[8];
      if (ae >= 4) return this.trainingEffectBands[4];
      if (ae >= 3) return this.trainingEffectBands[3];
      if (ae >= 2) return this.trainingEffectBands[2];
      if (ae >= 1) return this.trainingEffectBands[1];
    }
    if (an >= 5) return this.trainingEffectBands[8];
    if (an >= 4) return this.trainingEffectBands[7];
    if (an >= 3) return this.trainingEffectBands[6];
    if (an >= 2) return this.trainingEffectBands[5];
    return this.trainingEffectBands[1];
  }

  latestTrainingLoadBand(a: Activity): HeatmapBand | null {
    const v = a.activityTrainingLoad;
    if (v == null) return null;
    return this.trainingLoadBands.find((b) => v >= b.min && v < b.max) ?? null;
  }
}
