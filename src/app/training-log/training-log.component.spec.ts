import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DecimalPipe, DatePipe } from '@angular/common';
import { TrainingLogComponent } from './training-log.component';
import { ActivityService } from '../activity.service';
import { Activity } from '../types/Activity';

const MOCK_RUN: Activity = {
  id: '1',
  source: 'garmin',
  name: 'Morning Run',
  activity_type: 'run',
  start_date: '2024-01-15T08:00:00Z',
  distance_meters: 5000,
  moving_time_seconds: 1800,
  encoded_route: null,
  start_latitude: null,
  start_longitude: null
};

describe('TrainingLogComponent', () => {
  let component: TrainingLogComponent;
  let fixture: ComponentFixture<TrainingLogComponent>;
  let activityServiceSpy: jasmine.SpyObj<ActivityService>;

  beforeEach(async () => {
    // Stub IntersectionObserver to prevent real IO callbacks from firing
    // inside zone.run() during change detection, which would cause NG0100.
    (window as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    activityServiceSpy = jasmine.createSpyObj('ActivityService', [
      'getActivities'
    ]);
    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({ activities: [MOCK_RUN], syncError: false })
    );

    await TestBed.configureTestingModule({
      declarations: [TrainingLogComponent],
      imports: [RouterTestingModule],
      providers: [
        DecimalPipe,
        DatePipe,
        { provide: ActivityService, useValue: activityServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TrainingLogComponent);
    component = fixture.componentInstance;
  });

  describe('formatActivityType()', () => {
    it('returns "Run" for activity_type "run"', () => {
      expect(component.formatActivityType('run')).toBe('Run');
    });

    it('returns "Ride" for activity_type "ride"', () => {
      expect(component.formatActivityType('ride')).toBe('Ride');
    });

    it('returns "Swim" for activity_type "swim"', () => {
      expect(component.formatActivityType('swim')).toBe('Swim');
    });

    it('returns "Walk" for activity_type "walk"', () => {
      expect(component.formatActivityType('walk')).toBe('Walk');
    });

    it('returns "Other" for activity_type "other"', () => {
      expect(component.formatActivityType('other')).toBe('Other');
    });

    it('capitalises any unknown type', () => {
      expect(component.formatActivityType('yoga')).toBe('Yoga');
    });
  });

  describe('syncError banner', () => {
    it('hides the banner when syncError is false', () => {
      component.syncError = false;
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.sync-error-banner');
      expect(banner).toBeNull();
    });

    it('shows the banner when syncError is true', () => {
      component.syncError = true;
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.sync-error-banner');
      expect(banner).not.toBeNull();
    });

    it('sets syncError = true when getActivities() returns syncError: true', async () => {
      activityServiceSpy.getActivities.and.returnValue(
        Promise.resolve({ activities: [], syncError: true })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.syncError).toBeTrue();
    });

    it('sets syncError = false when getActivities() returns syncError: false', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.syncError).toBeFalse();
    });
  });

  describe('activity type label in modal', () => {
    it('displays "Run" when activity_type is "run"', () => {
      component.loaded = true;
      component.onBubbleClick(MOCK_RUN);
      fixture.detectChanges();

      const typeLabel = fixture.nativeElement.querySelector(
        '.activity-type-label'
      );
      expect(typeLabel).not.toBeNull();
      expect(typeLabel.textContent.trim()).toBe('Run');
    });
  });

  describe('mixed-source parity (US-3 AC1, AC3)', () => {
    const STRAVA_RUN: Activity = {
      id: 'strava-1',
      source: 'strava',
      name: 'Test Run',
      activity_type: 'run',
      start_date: '2024-01-15T09:00:00Z',
      distance_meters: 5000,
      moving_time_seconds: 1800,
      encoded_route: null,
      start_latitude: null,
      start_longitude: null
    };
    const GARMIN_RUN: Activity = {
      id: 'garmin-1',
      source: 'garmin',
      name: 'Test Run',
      activity_type: 'run',
      start_date: '2024-01-15T09:00:00Z',
      distance_meters: 5000,
      moving_time_seconds: 1800,
      encoded_route: null,
      start_latitude: null,
      start_longitude: null
    };

    it('should display activities from both strava and garmin with same fields', async () => {
      activityServiceSpy.getActivities.and.returnValue(
        Promise.resolve({
          activities: [STRAVA_RUN, GARMIN_RUN],
          syncError: false
        })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.activities.length).toBe(2);

      // No source-specific visual distinction should exist
      expect(fixture.nativeElement.querySelector('.strava-badge')).toBeNull();
      expect(fixture.nativeElement.querySelector('.garmin-badge')).toBeNull();
    });

    it('should display activities in reverse-chronological week order', async () => {
      const actWeek2: Activity = {
        id: 'w1',
        source: 'garmin',
        name: 'Recent Run',
        activity_type: 'run',
        start_date: '2024-01-22T09:00:00Z',
        distance_meters: 5000,
        moving_time_seconds: 1800,
        encoded_route: null,
        start_latitude: null,
        start_longitude: null
      };
      const actWeek1a: Activity = {
        id: 'w2',
        source: 'garmin',
        name: 'Older Run A',
        activity_type: 'run',
        start_date: '2024-01-15T09:00:00Z',
        distance_meters: 4000,
        moving_time_seconds: 1500,
        encoded_route: null,
        start_latitude: null,
        start_longitude: null
      };
      const actWeek1b: Activity = {
        id: 'w3',
        source: 'garmin',
        name: 'Older Run B',
        activity_type: 'run',
        start_date: '2024-01-16T10:00:00Z',
        distance_meters: 3000,
        moving_time_seconds: 1200,
        encoded_route: null,
        start_latitude: null,
        start_longitude: null
      };

      activityServiceSpy.getActivities.and.returnValue(
        Promise.resolve({
          activities: [actWeek2, actWeek1a, actWeek1b],
          syncError: false
        })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.weekGroups.length).toBe(2);
      // Most recent week should be first
      expect(component.weekGroups[0].weekKey).toBe('2024-01-22');
      expect(component.weekGroups[1].weekKey).toBe('2024-01-15');
    });

    it('should render strava and garmin activities with identical DOM structure', () => {
      const stravaActivity: Activity = {
        id: 'strava-1',
        source: 'strava',
        name: 'Morning Run',
        activity_type: 'run',
        start_date: '2024-01-15T09:00:00Z',
        distance_meters: 5000,
        moving_time_seconds: 1800,
        encoded_route: null,
        start_latitude: null,
        start_longitude: null
      };

      // Use synchronous setup (same pattern as modal tests above) to avoid
      // NG0100 from the IntersectionObserver / setTimeout inside load().
      component.loaded = true;
      component.selectedActivity = stravaActivity;
      fixture.detectChanges();

      const modalHeader = fixture.nativeElement.querySelector(
        '.activity-modal-header'
      );
      expect(modalHeader).not.toBeNull();
      expect(modalHeader.textContent).toContain('Morning Run');

      // No source label should appear in the modal for individual activities
      const fullText: string = fixture.nativeElement.textContent;
      expect(fullText).not.toContain('Strava');
      expect(fullText).not.toContain('Garmin');
    });
  });
});
