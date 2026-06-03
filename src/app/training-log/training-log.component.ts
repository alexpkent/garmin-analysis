import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivityService } from '../activity.service';
import { Activity } from '../types/Activity';
import moment from 'moment';

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
  otherCount: number;
}

interface DayData {
  date: moment.Moment;
  activities: Activity[];
}

interface WeekData {
  weekKey: string;
  weekLabel: string;
  totalMiles: number;
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

  private scrollObserver: IntersectionObserver | null = null;
  private weekToNavKey = new Map<string, string>();
  private visibleWeeks = new Set<string>();
  private isProgrammaticScroll = false;
  private programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null;

  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  private readonly METERS_PER_MILE = 1609;
  private readonly SECONDS_PER_HOUR = 3600;

  readonly runColor = '#E63419';
  readonly rideColor = '#2B54D4';
  readonly otherColor = '#b316de';

  constructor(
    private activityService: ActivityService,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe,
    private zone: NgZone
  ) {}

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
      const weekKey = moment(activity.start_date)
        .startOf('isoWeek')
        .format('YYYY-MM-DD');
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, []);
      }
      weekMap.get(weekKey)!.push(activity);
    }

    const weekKeys = Array.from(weekMap.keys()).sort().reverse();

    this.weekGroups = weekKeys.map((weekKey) => {
      const weekStart = moment(weekKey);
      const weekEnd = weekStart.clone().endOf('isoWeek');
      const weekActivities = weekMap.get(weekKey)!;

      const days: DayData[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = weekStart.clone().add(i, 'days');
        const dayActivities = weekActivities
          .filter((a) => moment(a.start_date).isSame(dayDate, 'day'))
          .sort(
            (a, b) =>
              moment(b.start_date).valueOf() - moment(a.start_date).valueOf()
          );
        days.push({ date: dayDate, activities: dayActivities });
      }

      const totalMiles = weekActivities.reduce(
        (sum, a) => sum + this.distanceToMiles(a.distance_meters),
        0
      );
      return {
        weekKey,
        weekLabel: this.formatWeekLabel(weekStart, weekEnd),
        totalMiles,
        days
      };
    });
  }

  private formatWeekLabel(start: moment.Moment, end: moment.Moment): string {
    if (start.month() === end.month()) {
      return start.format('MMM D') + ' – ' + end.format('D');
    }
    return start.format('MMM D') + ' – ' + end.format('MMM D');
  }

  private buildSummaries() {
    const now = moment();
    const ranges = [
      { label: 'This Week', from: moment().startOf('isoWeek') },
      { label: 'This Month', from: moment().startOf('month') },
      { label: 'This Year', from: moment().startOf('year') },
      { label: 'All Time', from: moment(0) }
    ];

    this.summaries = ranges.map(({ label, from }) => {
      const filtered = this.activities.filter(
        (a) =>
          moment(a.start_date).isSameOrAfter(from) &&
          moment(a.start_date).isSameOrBefore(now)
      );
      return {
        label,
        distance: filtered.reduce((sum, a) => sum + a.distance_meters, 0),
        seconds: filtered.reduce((sum, a) => sum + a.moving_time_seconds, 0),
        runCount: filtered.filter((a) => this.isRun(a)).length,
        rideCount: filtered.filter((a) => this.isRide(a)).length,
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
      const d = moment(activity.start_date);
      const mapKey = `${d.year()}-${d.month()}`; // month is 0-indexed
      const weekKey = d.clone().startOf('isoWeek').format('YYYY-MM-DD');
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

    const currentYear = moment().year();
    const years = Array.from(yearMap.keys()).sort().reverse();
    this.yearMonthNav = years.map((year) => {
      const monthMap = yearMap.get(year)!;
      const months = Array.from(monthMap.keys())
        .sort((a, b) => a - b)
        .reverse()
        .map((month) => ({
          month,
          monthName: moment().month(month).format('MMM'),
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
      const d = moment(week.weekKey);
      let navKey = this.findNavKey(d.year(), d.month());
      if (!navKey) {
        // Week spans two months; try the end date's month
        const endD = d.clone().add(6, 'days');
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
      const activeBtn = document.querySelector(
        '.nav-month-active'
      ) as HTMLElement | null;
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'nearest' });
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

  circleSize(activity: Activity): number {
    const miles = this.distanceToMiles(activity.distance_meters);
    if (miles <= 0) {
      return 20;
    }
    return Math.round(18 + 70 * Math.sqrt(miles / this.maxActivityMiles));
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
    return this.otherColor;
  }

  activityIcon(activity: Activity): string {
    if (this.isRun(activity)) {
      return '🏃';
    }
    if (this.isRide(activity)) {
      return '🚴';
    }
    return '🏋️';
  }

  isRun(activity: Activity) {
    return activity.activity_type === 'run';
  }
  isRide(activity: Activity) {
    return activity.activity_type === 'ride';
  }
  isOtherActivity(activity: Activity) {
    return !this.isRun(activity) && !this.isRide(activity);
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

  distanceToMiles(meters: number) {
    return meters / this.METERS_PER_MILE;
  }
  secondsToHours(seconds: number) {
    return seconds / this.SECONDS_PER_HOUR;
  }

  getDuration(durationInSeconds: number): string {
    try {
      const hours = Math.floor(durationInSeconds / this.SECONDS_PER_HOUR);
      const minutes = Math.floor(durationInSeconds / 60) - hours * 60;
      const secs = durationInSeconds % 60;
      let formatted = '';
      if (hours > 0) {
        formatted += hours + ':';
      }
      formatted +=
        minutes.toString().padStart(2, '0') +
        ':' +
        secs.toString().padStart(2, '0');
      return formatted;
    } catch {
      return '';
    }
  }

  getTimeSince(startDate: string): string {
    return moment(startDate).fromNow();
  }
}
