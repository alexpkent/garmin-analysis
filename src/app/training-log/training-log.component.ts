import { Component, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { StravaService } from '../strava.service';
import { Activity } from '../types/Activity';
import { CalendarOptions, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import moment from 'moment';

interface Summary {
  label: string;
  distance: number;
  seconds: number;
  runCount: number;
  rideCount: number;
  otherCount: number;
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

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridYear,dayGridMonth,dayGridWeek,dayGridDay'
    },
    views: {
      dayGridYear: { type: 'dayGrid', duration: { years: 1 }, buttonText: 'Year' }
    },
    events: [],
    eventClick: this.onEventClick.bind(this),
    height: 'auto'
  };

  selectedActivity: Activity | null = null;

  summaries: Summary[] = [];

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
    this.buildCalendarEvents();
    this.buildSummaries();
    this.loading = false;
    this.loaded = true;
  }

  private buildCalendarEvents() {
    const events = this.activities.map((activity) => {
      const color = this.activityColor(activity);
      const miles = this.distanceToMiles(activity.distance);
      return {
        id: String(activity.id),
        title: `${this.activityIcon(activity)} ${this.decimalPipe.transform(miles, '1.1-1')} mi`,
        start: activity.start_date,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { activity }
      };
    });

    this.calendarOptions = { ...this.calendarOptions, events };
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

  onEventClick(clickInfo: EventClickArg) {
    this.selectedActivity = clickInfo.event.extendedProps['activity'] as Activity;
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
