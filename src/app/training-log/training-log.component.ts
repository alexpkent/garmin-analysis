import { Component, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { StravaService } from '../strava.service';
import { Activity } from '../types/Activity';
import moment from 'moment';

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
export class TrainingLogComponent implements OnInit {
  loading = false;
  loaded = false;

  activities: Activity[] = [];
  weekGroups: WeekData[] = [];
  maxActivityMiles = 1;

  selectedActivity: Activity | null = null;

  summaries: Summary[] = [];

  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  private readonly METERS_PER_MILE = 1609;
  private readonly SECONDS_PER_HOUR = 3600;

  readonly runColor = '#E63419';
  readonly rideColor = '#2B54D4';
  readonly otherColor = '#b316de';

  constructor(
    private stravaService: StravaService,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private async load() {
    this.loading = true;
    this.activities = (await this.stravaService.getActivities()) as Activity[];
    this.buildWeekGroups();
    this.buildSummaries();
    this.loading = false;
    this.loaded = true;
  }

  private buildWeekGroups() {
    if (this.activities.length === 0) {
      this.weekGroups = [];
      return;
    }

    this.maxActivityMiles = Math.max(
      ...this.activities.map(a => this.distanceToMiles(a.distance)), 1
    );

    const weekMap = new Map<string, Activity[]>();
    for (const activity of this.activities) {
      const weekKey = moment(activity.start_date).startOf('isoWeek').format('YYYY-MM-DD');
      if (!weekMap.has(weekKey)) { weekMap.set(weekKey, []); }
      weekMap.get(weekKey)!.push(activity);
    }

    const weekKeys = Array.from(weekMap.keys()).sort().reverse();

    this.weekGroups = weekKeys.map(weekKey => {
      const weekStart = moment(weekKey);
      const weekEnd = weekStart.clone().endOf('isoWeek');
      const weekActivities = weekMap.get(weekKey)!;

      const days: DayData[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = weekStart.clone().add(i, 'days');
        const dayActivities = weekActivities
          .filter(a => moment(a.start_date).isSame(dayDate, 'day'))
          .sort((a, b) => moment(a.start_date).valueOf() - moment(b.start_date).valueOf());
        days.push({ date: dayDate, activities: dayActivities });
      }

      const totalMiles = weekActivities.reduce((sum, a) => sum + this.distanceToMiles(a.distance), 0);
      return { weekLabel: this.formatWeekLabel(weekStart, weekEnd), totalMiles, days };
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
      const filtered = this.activities.filter((a) =>
        moment(a.start_date).isSameOrAfter(from) && moment(a.start_date).isSameOrBefore(now)
      );
      return {
        label,
        distance: filtered.reduce((sum, a) => sum + a.distance, 0),
        seconds: filtered.reduce((sum, a) => sum + a.moving_time, 0),
        runCount: filtered.filter((a) => this.isRun(a)).length,
        rideCount: filtered.filter((a) => this.isRide(a)).length,
        otherCount: filtered.filter((a) => this.isOtherActivity(a)).length
      };
    });
  }

  circleSize(activity: Activity): number {
    const miles = this.distanceToMiles(activity.distance);
    if (miles <= 0) { return 20; }
    return Math.round(18 + 70 * Math.sqrt(miles / this.maxActivityMiles));
  }

  onBubbleClick(activity: Activity) {
    this.selectedActivity = activity;
  }

  closeModal() {
    this.selectedActivity = null;
  }

  activityColor(activity: Activity): string {
    if (this.isRun(activity)) { return this.runColor; }
    if (this.isRide(activity)) { return this.rideColor; }
    return this.otherColor;
  }

  activityIcon(activity: Activity): string {
    if (this.isRun(activity)) { return '🏃'; }
    if (this.isRide(activity)) { return '🚴'; }
    return '🏋️';
  }

  isRun(activity: Activity) { return activity.type === 'Run'; }
  isRide(activity: Activity) { return activity.type === 'Ride'; }
  isOtherActivity(activity: Activity) { return !this.isRun(activity) && !this.isRide(activity); }

  distanceToMiles(meters: number) { return meters / this.METERS_PER_MILE; }
  secondsToHours(seconds: number) { return seconds / this.SECONDS_PER_HOUR; }

  getDuration(durationInSeconds: number): string {
    try {
      const hours = Math.floor(durationInSeconds / this.SECONDS_PER_HOUR);
      const minutes = Math.floor(durationInSeconds / 60) - hours * 60;
      const secs = durationInSeconds % 60;
      let formatted = '';
      if (hours > 0) { formatted += hours + ':'; }
      formatted += minutes.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      return formatted;
    } catch {
      return '';
    }
  }

  getTimeSince(startDate: string): string {
    return moment(startDate).fromNow();
  }
}
