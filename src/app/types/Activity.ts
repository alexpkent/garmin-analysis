export interface Activity {
  id: string;
  source: string;
  name: string;
  activity_type: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  encoded_route: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  duration?: number;
  averageHR?: number;
  maxHR?: number;
  trainingEffect?: number;
  anaerobicTrainingEffect?: number;
  trainingEffectLabel?: string;
  activityTrainingLoad?: number;
}

const TRAINING_EFFECT_LABEL_MAP: Record<string, string> = {
  NO_EFFECT:              'No Activity',
  RECOVERY:               'Recovery',
  RECOVERY_AEROBIC:       'Recovery',
  BASE:                   'Base (Low Aerobic)',
  AEROBIC_BASE:           'Base (Low Aerobic)',
  TEMPO:                  'Tempo (Low/Med Aerobic)',
  THRESHOLD:              'Threshold',
  VO2MAX:                 'VO₂ Max (High Aerobic)',
  HIGH_AEROBIC:           'High Aerobic / Mixed',
  ANAEROBIC_CAPACITY:     'Anaerobic Capacity',
  SPRINT:                 'Sprint (Anaerobic)',
  OVERREACHING:           'Anaerobic (Overreaching)',
  IMPROVING:              'Improving',
  MAINTAINING:            'Maintaining',
  PEAKING:                'Peaking',
  UNKNOWN:                '',
};

export function formatTrainingEffectLabel(label: string | undefined | null): string {
  if (!label) return '';
  return TRAINING_EFFECT_LABEL_MAP[label] ?? label;
}
