import { Activity } from '../types/Activity';
import { ACTIVITY_COLORS } from '../constants/colors';

export const METERS_PER_MILE = 1609.344;
export const SECONDS_PER_HOUR = 3600;

export function isRun(activity: Activity): boolean {
  return activity.activity_type === 'run';
}

export function isRide(activity: Activity): boolean {
  return activity.activity_type === 'ride';
}

export function isFootball(activity: Activity): boolean {
  const t = (activity.activity_type ?? '').toLowerCase();
  if (t === 'football' || t.includes('soccer') || t.includes('football'))
    return true;
  // Older activities stored as 'other' before the football type was added —
  // fall back to matching on the activity name.
  if (t === 'other') {
    const name = (activity.name ?? '').toLowerCase();
    return name.includes('football') || name.includes('soccer');
  }
  return false;
}

export function isOtherActivity(activity: Activity): boolean {
  return !isRun(activity) && !isRide(activity) && !isFootball(activity);
}

export function distanceToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

export function formatDistance(meters: number): string {
  return `${distanceToMiles(meters).toFixed(1)} mi`;
}

export function getDuration(seconds: number): string {
  const h = Math.floor(seconds / SECONDS_PER_HOUR);
  const m = Math.floor((seconds % SECONDS_PER_HOUR) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function activityIcon(activity: Activity): string {
  const t = (activity.activity_type ?? '').toLowerCase();
  if (t.includes('run')) return 'fas fa-running';
  if (t.includes('cycl') || t.includes('ride') || t.includes('bike'))
    return 'fas fa-bicycle';
  if (t.includes('swim')) return 'fas fa-swimmer';
  if (t.includes('football') || t.includes('soccer')) return 'fas fa-futbol';
  // Older activities stored as 'other' — check the name as a fallback.
  if (t === 'other') {
    const name = (activity.name ?? '').toLowerCase();
    if (name.includes('football') || name.includes('soccer'))
      return 'fas fa-futbol';
  }
  return 'fas fa-heartbeat';
}

export function activityColor(activity: Activity): string {
  if (isRun(activity)) return ACTIVITY_COLORS.run;
  if (isRide(activity)) return ACTIVITY_COLORS.ride;
  if (isFootball(activity)) return ACTIVITY_COLORS.football;
  return ACTIVITY_COLORS.other;
}

export function formatActivityType(type: string): string {
  const labels: Record<string, string> = {
    run: 'Run',
    ride: 'Ride',
    swim: 'Swim',
    walk: 'Walk',
    football: 'Football',
    soccer: 'Football',
    other: 'Other'
  };
  return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}
