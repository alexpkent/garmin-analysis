import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';
import { ActivityService } from './activity.service';
import { Activity } from './types/Activity';

describe('ActivityService', () => {
  let service: ActivityService;
  let httpMock: HttpTestingController;

  const mockActivities: Activity[] = [
    {
      id: '123',
      source: 'strava',
      name: 'Morning Run',
      activity_type: 'run',
      start_date: '2024-01-01T08:00:00Z',
      distance_meters: 5000,
      moving_time_seconds: 1800,
      encoded_route: null,
      start_latitude: null,
      start_longitude: null
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ActivityService]
    });
    service = TestBed.inject(ActivityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getActivities() should GET /api/activities and return activities array', async () => {
    const promise = service.getActivities();

    const req = httpMock.expectOne('/api/activities');
    expect(req.request.method).toBe('GET');
    req.flush(mockActivities);

    const result = await promise;
    expect(result.activities).toEqual(mockActivities);
  });

  it('getActivities() should return syncError: false when X-Sync-Error header is absent', async () => {
    const promise = service.getActivities();

    const req = httpMock.expectOne('/api/activities');
    req.flush(mockActivities);

    const result = await promise;
    expect(result.syncError).toBeFalse();
  });

  it('getActivities() should return syncError: true when X-Sync-Error header is "true"', async () => {
    const promise = service.getActivities();

    const req = httpMock.expectOne('/api/activities');
    req.flush([], { headers: { 'X-Sync-Error': 'true' } });

    const result = await promise;
    expect(result.syncError).toBeTrue();
  });
});
