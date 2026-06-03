import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { DecimalPipe, DatePipe } from '@angular/common';
import { HeatmapComponent } from './heatmap.component';
import { ActivityService } from '../activity.service';
import { View } from '../types/View';
import { Activity } from '../types/Activity';

const activityFixture: Activity = {
  id: '1',
  source: 'garmin',
  name: 'Test Activity',
  activity_type: 'run',
  start_date: '2024-01-15T09:00:00Z',
  distance_meters: 5000,
  moving_time_seconds: 1800,
  encoded_route: null,
  start_latitude: null,
  start_longitude: null
};

describe('HeatmapComponent', () => {
  let component: HeatmapComponent;
  let fixture: ComponentFixture<HeatmapComponent>;
  let activityServiceSpy: jasmine.SpyObj<ActivityService>;

  beforeEach(async () => {
    activityServiceSpy = jasmine.createSpyObj('ActivityService', [
      'getActivities'
    ]);

    await TestBed.configureTestingModule({
      declarations: [HeatmapComponent],
      imports: [RouterTestingModule],
      providers: [
        DecimalPipe,
        DatePipe,
        { provide: ActivityService, useValue: activityServiceSpy }
      ]
    }).compileComponents();

    // Stub Leaflet so the map initialisation does not throw in jsdom
    const layerStub = {
      addTo: () => layerStub,
      addLayer: () => {},
      bindPopup: () => {}
    };
    const mapStub = { addLayer: () => {}, setView: () => mapStub };
    (window as any).L = {
      map: () => mapStub,
      tileLayer: () => layerStub,
      layerGroup: () => layerStub,
      markerClusterGroup: () => layerStub,
      polyline: () => layerStub,
      Polyline: { fromEncoded: () => ({ getLatLngs: () => [] }) },
      control: {
        layers: () => ({ addTo: () => {} }),
        locate: () => ({ addTo: () => {} }),
        zoomHome: () => ({ addTo: () => {} })
      },
      Control: { zoomHome: () => ({ addTo: () => {} }) }
    };

    fixture = TestBed.createComponent(HeatmapComponent);
    component = fixture.componentInstance;
  });

  it('should set loaded = true when getActivities() returns an empty activity list', async () => {
    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({ activities: [], syncError: false })
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.loaded).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('should set syncError = true when service returns syncError: true', async () => {
    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({ activities: [], syncError: true })
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.syncError).toBeTrue();
  });

  it('should set syncError = false when service returns syncError: false', async () => {
    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({ activities: [], syncError: false })
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.syncError).toBeFalse();
  });

  it('should count no-route activity in totals without drawing a polyline', async () => {
    const runWithRoute: Activity = {
      id: '1',
      source: 'garmin',
      name: 'Run With Route',
      activity_type: 'run',
      start_date: '2024-01-15T09:00:00Z',
      distance_meters: 5000,
      moving_time_seconds: 1800,
      encoded_route: 'encoded_run_route',
      start_latitude: null,
      start_longitude: null
    };
    const runWithoutRoute: Activity = {
      id: '2',
      source: 'garmin',
      name: 'Run No Route',
      activity_type: 'run',
      start_date: '2024-01-15T10:00:00Z',
      distance_meters: 4000,
      moving_time_seconds: 1500,
      encoded_route: null,
      start_latitude: null,
      start_longitude: null
    };

    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({
        activities: [runWithRoute, runWithoutRoute],
        syncError: false
      })
    );

    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit call as per AC3 verification
    component.filterChanged(View.All);

    expect(component.polylines.length).toBe(1);
    expect(component.runCount).toBe(2);
  });

  it('should assign run colour to activity with activity_type "run" regardless of source', () => {
    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({ activities: [], syncError: false })
    );
    fixture.detectChanges();

    expect(
      component.isRun({
        ...activityFixture,
        activity_type: 'run',
        source: 'garmin'
      })
    ).toBeTrue();
    expect(
      component.isRun({
        ...activityFixture,
        activity_type: 'run',
        source: 'strava'
      })
    ).toBeTrue();
    expect(
      component.isRide({
        ...activityFixture,
        activity_type: 'ride',
        source: 'garmin'
      })
    ).toBeTrue();
    expect(
      component.isOtherActivity({
        ...activityFixture,
        activity_type: 'other',
        source: 'garmin'
      })
    ).toBeTrue();
  });

  it('should create polylines for both garmin and strava activities with route data', async () => {
    const stravaActivity: Activity = {
      ...activityFixture,
      id: 'strava-1',
      source: 'strava',
      encoded_route: 'encoded_strava_route'
    };
    const garminActivity: Activity = {
      ...activityFixture,
      id: 'garmin-1',
      source: 'garmin',
      encoded_route: 'encoded_garmin_route'
    };

    activityServiceSpy.getActivities.and.returnValue(
      Promise.resolve({
        activities: [stravaActivity, garminActivity],
        syncError: false
      })
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.polylines.length).toBe(2);
  });
});
