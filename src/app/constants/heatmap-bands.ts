import { environment } from '../../environments/environment';
import { UI_COLORS, STATUS_COLORS } from './colors';
import { HeatmapBand } from '../analysis/calendar-heatmap/calendar-heatmap.component';

export { HeatmapBand };

export const TRAINING_STATUS_LABEL: Record<string, string> = {
  PRODUCTIVE: 'Productive',
  MAINTAINING: 'Maintaining',
  PEAKING: 'Peaking',
  RECOVERY: 'Recovery',
  UNPRODUCTIVE: 'Unproductive',
  OVERREACHING: 'Overreaching',
  DETRAINING: 'Detraining'
};

export const TRAINING_STATUS_COLOR: Record<string, string> = {
  PRODUCTIVE: STATUS_COLORS.productive,
  MAINTAINING: STATUS_COLORS.maintaining,
  PEAKING: STATUS_COLORS.peaking,
  RECOVERY: STATUS_COLORS.recovery,
  UNPRODUCTIVE: STATUS_COLORS.unproductive,
  OVERREACHING: STATUS_COLORS.overreaching,
  DETRAINING: STATUS_COLORS.detraining
};

export const LOAD_BALANCE_LABEL: Record<string, string> = {
  AEROBIC_HIGH_FOCUS: 'Aerobic High Focus',
  AEROBIC_LOW_FOCUS: 'Aerobic Low Focus',
  ANAEROBIC_FOCUS: 'Anaerobic Focus',
  BALANCED: 'Balanced',
  LOAD_BALANCED: 'Balanced',
  LOW_LOAD: 'Low Load'
};

export const DISTANCE_BANDS: HeatmapBand[] = [
  { label: 'Short (< 5 mi)', min: 0, max: 5, color: '#4caf50' },
  { label: 'Moderate (5–10 mi)', min: 5, max: 10, color: UI_COLORS.accent },
  { label: 'Long (10–15 mi)', min: 10, max: 15, color: '#ff8c00' },
  { label: 'Very long (15+ mi)', min: 15, max: Infinity, color: '#e63419' }
];

export const DURATION_BANDS: HeatmapBand[] = [
  { label: 'Short (< 30 min)', min: 0, max: 1800, color: '#4caf50' },
  {
    label: 'Moderate (30–60 min)',
    min: 1800,
    max: 3600,
    color: UI_COLORS.accent
  },
  { label: 'Long (1–2 hrs)', min: 3600, max: 7200, color: '#ff8c00' },
  { label: 'Very long (2+ hrs)', min: 7200, max: Infinity, color: '#e63419' }
];

export const TRAINING_LOAD_BANDS: HeatmapBand[] = [
  { label: 'Very easy / recovery (0–50)', min: 0, max: 50, color: '#4caf50' },
  {
    label: 'Easy–moderate (50–100)',
    min: 50,
    max: 100,
    color: UI_COLORS.accent
  },
  { label: 'Moderate–hard (100–200)', min: 100, max: 200, color: '#ff8c00' },
  {
    label: 'Very hard / big stress (200+)',
    min: 200,
    max: Infinity,
    color: '#e63419'
  }
];

export const TRAINING_EFFECT_BANDS: HeatmapBand[] = [
  { label: 'Recovery', min: 0, max: 0, color: STATUS_COLORS.productive },
  {
    label: 'Base (Low Aerobic)',
    min: 0,
    max: 0,
    color: STATUS_COLORS.productive
  },
  { label: 'Tempo (Low/Med Aerobic)', min: 0, max: 0, color: '#F57C00' },
  { label: 'Threshold', min: 0, max: 0, color: '#F57C00' },
  { label: 'VO₂ Max (High Aerobic)', min: 0, max: 0, color: '#F57C00' },
  { label: 'High Aerobic / Mixed', min: 0, max: 0, color: '#F57C00' },
  { label: 'Anaerobic Capacity', min: 0, max: 0, color: '#6A1B9A' },
  { label: 'Sprint (Anaerobic)', min: 0, max: 0, color: '#6A1B9A' },
  { label: 'Anaerobic (Overreaching)', min: 0, max: 0, color: '#6A1B9A' }
];

/** Compute Tanaka max HR (220 − age) from environment.userDob. */
export function computeMaxHr(): number {
  const dob = new Date(environment.userDob);
  const now = new Date();
  const age =
    now.getFullYear() -
    dob.getFullYear() -
    (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
  return 220 - age;
}

/** Build HR zone bands from a given max HR value. */
export function makeMaxHrBands(maxHr: number): HeatmapBand[] {
  return [
    {
      label: 'Zone 1 – Warm-Up (50–60%)',
      min: Math.round(maxHr * 0.5),
      max: Math.round(maxHr * 0.6),
      color: '#9e9e9e'
    },
    {
      label: 'Zone 2 – Easy (60–70%)',
      min: Math.round(maxHr * 0.6),
      max: Math.round(maxHr * 0.7),
      color: '#4dabf7'
    },
    {
      label: 'Zone 3 – Aerobic (70–80%)',
      min: Math.round(maxHr * 0.7),
      max: Math.round(maxHr * 0.8),
      color: '#66bb6a'
    },
    {
      label: 'Zone 4 – Threshold (80–90%)',
      min: Math.round(maxHr * 0.8),
      max: Math.round(maxHr * 0.9),
      color: '#ffa726'
    },
    {
      label: 'Zone 5 – Maximum (90–100%)',
      min: Math.round(maxHr * 0.9),
      max: Infinity,
      color: '#ef5350'
    }
  ];
}
