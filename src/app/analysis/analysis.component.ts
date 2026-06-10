import { Component, OnInit } from '@angular/core';
import { ActivityService, HealthSnapshot } from '../activity.service';
import { Activity, formatTrainingEffectLabel } from '../types/Activity';
import {
  DaySelection,
  HeatmapBand
} from './calendar-heatmap/calendar-heatmap.component';
import { environment } from '../../environments/environment';
import dayjs, { Dayjs } from 'dayjs';
import type { ManipulateType } from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
import {
  TRAINING_STATUS_LABEL,
  TRAINING_STATUS_COLOR,
  LOAD_BALANCE_LABEL,
  DISTANCE_BANDS,
  DURATION_BANDS,
  TRAINING_LOAD_BANDS,
  TRAINING_EFFECT_BANDS,
  computeMaxHr,
  makeMaxHrBands
} from '../constants/heatmap-bands';
import { activityIcon } from '../utils/activity.utils';
import { UI_COLORS } from '../constants/colors';

export interface TrainingInsight {
  icon: string;
  label: string;
  text: string;
  color: string;
  level: 'good' | 'info' | 'warn' | 'alert';
}

interface AiAssessmentStatement {
  label: string;
  level: TrainingInsight['level'];
  text: string;
}

interface AiAnalysisExport {
  schema_version: 1;
  exported_at: string;
  analysis_window?: {
    days: number;
    start_date: string;
    end_date: string;
  };
  counts: {
    activities: number;
    health_snapshots: number;
    assessment_statements: number;
  };
  assessment_statements: AiAssessmentStatement[];
  activities: Activity[];
  health: HealthSnapshot[];
}

const CHATGPT_URL_LIMIT = 7000;
const CHATGPT_ANALYSIS_DAYS = 30;
const GARMIN_ANALYSIS_PROMPT =
  'Analyse this Garmin data and validate the assessment statements for correctness';

@Component({
  selector: 'app-analysis',
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.scss'],
  standalone: false
})
export class AnalysisComponent implements OnInit {
  activities: Activity[] = [];
  syncError = false;
  loading = true;
  loaded = false;
  lastAssessedTime: Date | null = null;
  selectedDay: DaySelection | null = null;
  latestActivity: Activity | null = null;
  healthSnapshots: HealthSnapshot[] = [];
  latestHealth: HealthSnapshot | null = null;
  todayReadinessHealth: HealthSnapshot | null = null;

  // Period navigation
  periodSize: 'week' | 'month' | 'quarter' | 'year' = 'year';
  private periodsBack = 0;
  periodEnd: Dayjs = dayjs().startOf('day');
  periodStart: Dayjs = dayjs().startOf('day').subtract(364, 'days');
  minActivityDate: Dayjs | null = null;

  private get periodDuration(): {
    amount: number;
    unit: ManipulateType;
  } {
    switch (this.periodSize) {
      case 'week':
        return { amount: 1, unit: 'week' };
      case 'month':
        return { amount: 1, unit: 'month' };
      case 'quarter':
        return { amount: 3, unit: 'months' };
      default:
        return { amount: 12, unit: 'months' };
    }
  }

  get periodLabel(): string {
    if (this.periodSize === 'week') {
      return `${this.periodStart.format('D MMM')} – ${this.periodEnd.format('D MMM YYYY')}`;
    }
    if (this.periodSize === 'month') {
      return this.periodStart.format('MMMM YYYY');
    }
    if (this.periodSize === 'quarter') {
      return `${this.periodStart.format('MMM')} – ${this.periodEnd.format('MMM YYYY')}`;
    }
    return `${this.periodStart.format('MMM YYYY')} – ${this.periodEnd.format('MMM YYYY')}`;
  }

  get canGoForward(): boolean {
    return this.periodsBack > 0;
  }

  get canGoBack(): boolean {
    return this.minActivityDate
      ? this.periodStart
          .subtract(1, 'day')
          .isSameOrAfter(this.minActivityDate, 'day')
      : false;
  }

  private updatePeriod(): void {
    const { amount, unit } = this.periodDuration;
    this.periodEnd = dayjs()
      .startOf('day')
      .subtract(this.periodsBack * amount, unit as ManipulateType);
    this.periodStart = this.periodEnd.subtract(amount, unit as ManipulateType);
  }

  setPeriodSize(size: 'week' | 'month' | 'quarter' | 'year'): void {
    this.periodSize = size;
    this.periodsBack = 0;
    this.updatePeriod();
  }

  goBack(): void {
    this.periodsBack++;
    this.updatePeriod();
  }

  goForward(): void {
    if (this.periodsBack > 0) {
      this.periodsBack--;
      this.updatePeriod();
    }
  }

  readonly trainingLoadBands = TRAINING_LOAD_BANDS;
  readonly trainingEffectBands = TRAINING_EFFECT_BANDS;

  readonly trainingEffectClassifier = (a: Activity): HeatmapBand | null => {
    const ae = a.trainingEffect ?? 0;
    const an = a.anaerobicTrainingEffect ?? 0;
    if (ae === 0 && an === 0) return null;

    // Use Garmin's own label as the primary classifier — it already encodes
    // the correct primary benefit (aerobic vs anaerobic dominant).
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

    // Fallback numeric thresholds (when label absent).
    // Garmin scale: 1=Minor, 2=Maintaining, 3=Improving, 4=Highly Improving, 5=Overreaching
    // Aerobic takes priority when it is the dominant score.
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
  };

  private readonly tanakaMaxHr: number = computeMaxHr();

  readonly maxHrBands = makeMaxHrBands(this.tanakaMaxHr);

  readonly maxHrClassifier = (a: Activity): HeatmapBand | null => {
    const hr = a.maxHR;
    if (hr == null || hr === 0) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  };

  readonly avgHrClassifier = (a: Activity): HeatmapBand | null => {
    const hr = a.averageHR;
    if (hr == null || hr === 0) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  };

  readonly distanceBands = DISTANCE_BANDS;

  readonly distanceClassifier = (a: Activity): HeatmapBand | null => {
    const miles = (a.distance_meters ?? 0) * 0.000621371;
    if (miles === 0) return null;
    return (
      this.distanceBands.find((b) => miles >= b.min && miles < b.max) ?? null
    );
  };

  readonly durationBands = DURATION_BANDS;

  readonly durationClassifier = (a: Activity): HeatmapBand | null => {
    const secs = a.duration ?? a.moving_time_seconds ?? 0;
    if (secs === 0) return null;
    return (
      this.durationBands.find((b) => secs >= b.min && secs < b.max) ?? null
    );
  };

  constructor(private activityService: ActivityService) {}

  async exportAnalysisData(): Promise<void> {
    const data = await this.buildAiAnalysisExport();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `garmin-analysis-${data.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async openChatGptAnalysis(): Promise<void> {
    const chatWindow = window.open('about:blank', '_blank');
    const data = await this.buildAiAnalysisExport(CHATGPT_ANALYSIS_DAYS);
    const prompt = this.buildChatGptPrompt(data, true);
    const directUrl = this.chatGptUrl(prompt);

    if (directUrl) {
      this.openChatGptUrl(directUrl, chatWindow);
      return;
    }

    const copied = await this.copyText(prompt);
    const fallbackPrompt = copied
      ? `${GARMIN_ANALYSIS_PROMPT}. I have copied the last ${CHATGPT_ANALYSIS_DAYS} days of JSON data to my clipboard; ask me to paste it.`
      : `${GARMIN_ANALYSIS_PROMPT}. I could not fit the last ${CHATGPT_ANALYSIS_DAYS} days of JSON data into the URL; ask me to paste the exported JSON file.`;
    this.openChatGptUrl(this.chatGptUrl(fallbackPrompt)!, chatWindow);
  }

  private async buildAiAnalysisExport(
    days?: number
  ): Promise<AiAnalysisExport> {
    const [{ activities }, health] = await Promise.all([
      this.activityService.getActivities(),
      this.activityService.getHealth()
    ]);
    const today = dayjs().startOf('day');
    const startDate = days != null ? today.subtract(days, 'days') : null;
    const filteredActivities = startDate
      ? activities.filter((a) =>
          dayjs(a.start_date).isSameOrAfter(startDate, 'day')
        )
      : activities;
    const filteredHealth = startDate
      ? health.filter((s) => dayjs(s.date).isSameOrAfter(startDate, 'day'))
      : health;

    const analysisWindow = startDate
      ? {
          days,
          start_date: startDate.format('YYYY-MM-DD'),
          end_date: today.format('YYYY-MM-DD')
        }
      : undefined;
    const assessmentStatements = this.buildAssessmentStatements();

    return {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      ...(analysisWindow ? { analysis_window: analysisWindow } : {}),
      counts: {
        activities: filteredActivities.length,
        health_snapshots: filteredHealth.length,
        assessment_statements: assessmentStatements.length
      },
      assessment_statements: assessmentStatements,
      activities: filteredActivities,
      health: filteredHealth
    };
  }

  private buildAssessmentStatements(): AiAssessmentStatement[] {
    const insights = this.trainingInsights.length
      ? this.trainingInsights
      : this.computeTrainingInsights();
    return insights.map(({ label, level, text }) => ({ label, level, text }));
  }

  private buildChatGptPrompt(data: AiAnalysisExport, compact = false): string {
    const json = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
    return `${GARMIN_ANALYSIS_PROMPT}\n\n${json}`;
  }

  private chatGptUrl(prompt: string): string | null {
    const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    return url.length <= CHATGPT_URL_LIMIT ? url : null;
  }

  private openChatGptUrl(url: string, chatWindow: Window | null): void {
    if (chatWindow) {
      chatWindow.location.href = url;
    } else {
      window.location.href = url;
    }
  }

  private async copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  ngOnInit(): void {
    this.activityService
      .getActivities()
      .then(({ activities, syncError }) => {
        this.activities = activities;
        this.syncError = syncError;
        this.loading = false;
        this.loaded = true;
        if (activities.length > 0) {
          this.latestActivity = activities.reduce((latest, a) =>
            new Date(a.start_date) > new Date(latest.start_date) ? a : latest
          );
          this.minActivityDate = activities.reduce((earliest, a) => {
            const d = dayjs(a.start_date);
            return d.isBefore(earliest) ? d : earliest;
          }, dayjs(activities[0].start_date));
        }
        this.updateAlertCount();
      })
      .catch(() => {
        this.loading = false;
      });

    this.activityService.getHealth().then((snapshots) => {
      this.healthSnapshots = snapshots;
      const today = dayjs().format('YYYY-MM-DD');
      this.todayReadinessHealth =
        snapshots.find(
          (s) => s.date === today && s.training_readiness?.score != null
        ) ?? null;
      // Prefer the most recent entry that has at least some non-null data so
      // that an all-null placeholder for today doesn't blank out the display.
      const withData = snapshots.filter(
        (s) =>
          s.vo2max_running != null ||
          s.training_status != null ||
          s.load_focus != null ||
          s.resting_hr != null ||
          s.training_readiness != null
      );
      const pool = withData.length > 0 ? withData : snapshots;
      this.latestHealth =
        pool.length > 0
          ? pool.reduce((a, b) => (a.date > b.date ? a : b))
          : null;
      this.updateAlertCount();
    });
  }

  private updateAlertCount(): void {
    this._trainingInsightsCache = this.computeTrainingInsights();
    this.activityService.trainingAlertCount =
      this._trainingInsightsCache.filter((i) => i.level === 'alert').length;
    this.lastAssessedTime = new Date();
  }

  closePopup(): void {
    this.selectedDay = null;
  }

  formatTrainingStatus(phrase: string | null | undefined): string {
    if (!phrase) return 'No Status';
    const prefix = phrase.replace(/_\d+$/, '');
    return TRAINING_STATUS_LABEL[prefix] ?? phrase;
  }

  trainingStatusColor(phrase: string | null | undefined): string {
    if (!phrase) return '#6c757d';
    const prefix = phrase.replace(/_\d+$/, '');
    return TRAINING_STATUS_COLOR[prefix] ?? '#adb5bd';
  }

  formatLoadBalance(phrase: string | null | undefined): string {
    if (!phrase) return '';
    return (
      LOAD_BALANCE_LABEL[phrase] ??
      phrase
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  latestActivityIcon(a: Activity): string {
    return activityIcon(a);
  }

  latestDuration(a: Activity): string {
    const secs = a.duration ?? a.moving_time_seconds;
    if (!secs) return '';
    const hours = Math.floor(secs / 3600);
    const mins = Math.round((secs % 3600) / 60);
    if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
    if (hours > 0) return `${hours} hr`;
    return `${mins} mins`;
  }

  latestTrainingEffectBand(a: Activity): HeatmapBand | null {
    return this.trainingEffectClassifier(a);
  }

  latestDistanceBand(a: Activity): HeatmapBand | null {
    return this.distanceClassifier(a);
  }

  latestDurationBand(a: Activity): HeatmapBand | null {
    return this.durationClassifier(a);
  }

  latestHrBand(hr: number | undefined): HeatmapBand | null {
    if (!hr) return null;
    return this.maxHrBands.find((b) => hr >= b.min && hr < b.max) ?? null;
  }

  latestTrainingLoadBand(a: Activity): HeatmapBand | null {
    const v = a.activityTrainingLoad;
    if (v == null) return null;
    return this.trainingLoadBands.find((b) => v >= b.min && v < b.max) ?? null;
  }

  // ── VO2 max category (Garmin / Cooper Institute standard ratings) ───────
  // Thresholds are the *minimum* value for each category per age group.
  // Age groups (index 0-5): 20-29, 30-39, 40-49, 50-59, 60-69, 70+
  // Each row: [superior, excellent, good, fair]
  private readonly VO2_MAX_THRESHOLDS: Record<'male' | 'female', number[][]> = {
    male: [
      [55.4, 51.1, 45.4, 41.7], // 20-29
      [54.0, 48.3, 44.0, 40.5], // 30-39
      [52.5, 46.4, 42.4, 38.5], // 40-49
      [48.9, 43.4, 39.2, 35.6], // 50-59
      [45.7, 39.5, 35.5, 32.3], // 60-69
      [42.1, 36.7, 32.3, 29.4] // 70+
    ],
    female: [
      [49.6, 43.9, 39.5, 36.1], // 20-29
      [47.4, 42.4, 37.8, 34.4], // 30-39
      [45.3, 39.7, 36.3, 33.0], // 40-49
      [41.1, 36.7, 33.0, 30.1], // 50-59
      [37.8, 33.0, 30.0, 27.5], // 60-69
      [36.7, 30.9, 28.1, 25.9] // 70+
    ]
  };

  private readonly userAgeGroup: number = (() => {
    const dob = new Date(environment.userDob);
    const now = new Date();
    const age =
      now.getFullYear() -
      dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())
        ? 1
        : 0);
    if (age < 30) return 0;
    if (age < 40) return 1;
    if (age < 50) return 2;
    if (age < 60) return 3;
    if (age < 70) return 4;
    return 5;
  })();

  readinessCategory(score: number | null | undefined): {
    label: string;
    color: string;
  } {
    if (score == null) return { label: 'Unknown', color: '#6c757d' };
    if (score >= 75) return { label: 'Optimal', color: '#4caf50' };
    if (score >= 50) return { label: 'Good', color: '#ffd54f' };
    if (score >= 25) return { label: 'Fair', color: '#ff8c00' };
    return { label: 'Low', color: '#e63419' };
  }

  vo2maxCategory(
    vo2: number | null | undefined
  ): { label: string; color: string } | null {
    if (vo2 == null) return null;
    const thresholds =
      this.VO2_MAX_THRESHOLDS[environment.userGender][this.userAgeGroup];
    if (vo2 >= thresholds[0]) return { label: 'Superior', color: '#9c27b0' };
    if (vo2 >= thresholds[1]) return { label: 'Excellent', color: '#42a5f5' };
    if (vo2 >= thresholds[2]) return { label: 'Good', color: '#4caf50' };
    if (vo2 >= thresholds[3]) return { label: 'Fair', color: '#ff8c00' };
    return { label: 'Poor', color: '#e63419' };
  }

  formatTeLabel(label: string | undefined): string {
    return formatTrainingEffectLabel(label);
  }

  garminUrl(activity: Activity): string {
    return `https://connect.garmin.com/app/activity/${activity.id}`;
  }

  // ── Load zone gauge helpers ─────────────────────────────
  private gaugeMax(actual: number | null, high: number | null): number {
    return Math.max(actual ?? 0, high ?? 0) * 1.35 || 100;
  }

  loadGaugeActualPct(
    actual: number | null,
    low: number | null,
    high: number | null
  ): string {
    if (actual == null) return '0%';
    return `${Math.min(100, (actual / this.gaugeMax(actual, high)) * 100).toFixed(1)}%`;
  }

  loadGaugeTargetLeft(
    actual: number | null,
    low: number | null,
    high: number | null
  ): string {
    if (low == null) return '0%';
    return `${((low / this.gaugeMax(actual, high)) * 100).toFixed(1)}%`;
  }

  loadGaugeTargetWidth(
    actual: number | null,
    low: number | null,
    high: number | null
  ): string {
    if (low == null || high == null) return '0%';
    return `${(((high - low) / this.gaugeMax(actual, high)) * 100).toFixed(1)}%`;
  }

  activityValue(activity: Activity): number | null {
    if (!this.selectedDay || this.selectedDay.activityClassifier) return null;
    const v = activity[this.selectedDay.valueKey];
    return typeof v === 'number' ? v : null;
  }

  activityFormattedValue(activity: Activity): string | null {
    if (!this.selectedDay) return null;
    const key = this.selectedDay.valueKey;
    switch (key) {
      case 'trainingEffect': {
        const ae = activity.trainingEffect;
        const an = activity.anaerobicTrainingEffect;
        const parts: string[] = [];
        if (ae != null && ae > 0) parts.push(`Aerobic ${ae.toFixed(1)}`);
        if (an != null && an > 0) parts.push(`Anaerobic ${an.toFixed(1)}`);
        return parts.length ? parts.join(' · ') : null;
      }
      case 'averageHR': {
        const hr = activity.averageHR;
        return hr != null && hr > 0 ? `${Math.round(hr)} bpm` : null;
      }
      case 'maxHR': {
        const hr = activity.maxHR;
        return hr != null && hr > 0 ? `${Math.round(hr)} bpm` : null;
      }
      case 'distance_meters': {
        const miles = (activity.distance_meters ?? 0) / 1609.344;
        return miles > 0 ? `${miles.toFixed(1)} mi` : null;
      }
      case 'moving_time_seconds': {
        const secs = activity.duration ?? activity.moving_time_seconds;
        if (!secs) return null;
        const hours = Math.floor(secs / 3600);
        const mins = Math.round((secs % 3600) / 60);
        if (hours > 0 && mins > 0) return `${hours} hr ${mins} mins`;
        if (hours > 0) return `${hours} hr`;
        return `${mins} mins`;
      }
      case 'activityTrainingLoad': {
        const v = activity.activityTrainingLoad;
        return v != null ? `${Math.round(v)}` : null;
      }
      default:
        return null;
    }
  }

  activityBand(activity: Activity): HeatmapBand | null {
    if (!this.selectedDay) return null;
    if (this.selectedDay.activityClassifier) {
      return this.selectedDay.activityClassifier(activity);
    }
    const v = this.activityValue(activity);
    if (v == null) return null;
    return this.selectedDay.bands.find((b) => v >= b.min && v < b.max) ?? null;
  }

  activityIcon(activity: Activity): string {
    return activityIcon(activity);
  }

  // ── Training Assessment ─────────────────────────────────
  private _trainingInsightsCache: TrainingInsight[] | null = null;

  get trainingInsights(): TrainingInsight[] {
    return this._trainingInsightsCache ?? [];
  }

  private computeTrainingInsights(): TrainingInsight[] {
    const insights: TrainingInsight[] = [];
    const now = dayjs();

    const highRiskInsight = this.computeHighRiskInsight(now);
    if (highRiskInsight) {
      insights.push(highRiskInsight);
    }

    // 1. Training Readiness
    if (this.todayReadinessHealth?.training_readiness?.score != null) {
      const score = this.todayReadinessHealth.training_readiness.score;
      const cat = this.readinessCategory(score);
      const feedbackMap: Record<string, string> = {
        OPTIMAL: 'Your body is primed — a great day to push hard.',
        GOOD: 'You are well recovered and ready to train.',
        FAIR: 'Moderate readiness — moderate intensity recommended.',
        LOW: 'Readiness is low — consider an easy or rest day.',
        VERY_LOW: 'Very low readiness — prioritise rest and recovery.'
      };
      const feedback =
        this.todayReadinessHealth.training_readiness.feedback ?? '';
      const text =
        feedbackMap[feedback] ??
        `Score ${score} — ${feedback.replace(/_/g, ' ').toLowerCase()}.`;
      const level: TrainingInsight['level'] =
        score >= 75
          ? 'good'
          : score >= 50
            ? 'info'
            : score >= 25
              ? 'warn'
              : 'alert';
      insights.push({
        icon: 'fas fa-bolt',
        label: `Readiness ${score}`,
        text,
        color: cat.color,
        level
      });
    }

    // 2. Garmin training status
    if (this.latestHealth?.training_status) {
      const status = this.latestHealth.training_status.replace(/_\d+$/, '');
      const color = TRAINING_STATUS_COLOR[status] ?? '#adb5bd';
      const label = TRAINING_STATUS_LABEL[status] ?? status;
      const descriptions: Record<string, string> = {
        PRODUCTIVE: 'Your fitness is improving — keep it up.',
        MAINTAINING: "You're maintaining current fitness levels.",
        PEAKING: "You're at peak fitness — excellent work.",
        RECOVERY: 'Your body is recovering — ease off intensity.',
        UNPRODUCTIVE:
          "Load isn't yielding fitness gains — try adjusting intensity.",
        OVERREACHING: 'You may be overtraining — prioritise recovery.',
        DETRAINING: "Activity has dropped — you're losing fitness."
      };
      const level: TrainingInsight['level'] = ['OVERREACHING'].includes(status)
        ? 'alert'
        : ['UNPRODUCTIVE', 'DETRAINING'].includes(status)
          ? 'warn'
          : ['PRODUCTIVE', 'PEAKING'].includes(status)
            ? 'good'
            : 'info';
      insights.push({
        icon: 'fas fa-chart-line',
        label: 'Training Status',
        text: `${label} — ${descriptions[status] ?? ''}`,
        color,
        level
      });
    }

    // 2. Weekly load trend (last 7d vs prior 7d)
    const last7 = this.activities
      .filter((a) => dayjs(a.start_date).isAfter(now.subtract(7, 'days')))
      .reduce((sum, a) => sum + (a.activityTrainingLoad ?? 0), 0);
    const prior7 = this.activities
      .filter((a) => {
        const d = dayjs(a.start_date);
        return (
          d.isAfter(now.subtract(14, 'days')) &&
          d.isSameOrBefore(now.subtract(7, 'days'))
        );
      })
      .reduce((sum, a) => sum + (a.activityTrainingLoad ?? 0), 0);
    if (last7 > 0 || prior7 > 0) {
      if (prior7 > 0) {
        const pct = Math.round(((last7 - prior7) / prior7) * 100);
        const sign = pct > 0 ? '+' : '';
        if (pct > 25) {
          insights.push({
            icon: 'fas fa-arrow-up',
            label: 'Load Spike',
            text: `Load jumped ${sign}${pct}% this week vs last — watch for overreaching.`,
            color: '#e63419',
            level: 'alert'
          });
        } else if (pct > 10) {
          insights.push({
            icon: 'fas fa-arrow-up',
            label: 'Load Rising',
            text: `Load up ${pct}% this week — steady progression.`,
            color: UI_COLORS.accent,
            level: 'info'
          });
        } else if (pct >= -10) {
          insights.push({
            icon: 'fas fa-minus',
            label: 'Load Stable',
            text: `Load consistent week-on-week (${sign}${pct}%).`,
            color: '#4caf50',
            level: 'good'
          });
        } else if (pct >= -30) {
          insights.push({
            icon: 'fas fa-arrow-down',
            label: 'Load Easing',
            text: `Load down ${Math.abs(pct)}% this week — recovery or taper.`,
            color: '#42a5f5',
            level: 'info'
          });
        } else {
          insights.push({
            icon: 'fas fa-arrow-down',
            label: 'Low Load',
            text: `Load dropped ${Math.abs(pct)}% this week — significant rest period.`,
            color: '#adb5bd',
            level: 'info'
          });
        }
      } else {
        insights.push({
          icon: 'fas fa-bolt',
          label: 'First Week Back',
          text: 'No load last week — this is your first active week back.',
          color: '#42a5f5',
          level: 'info'
        });
      }
    }

    // 3. Load zone balance (from Garmin load_focus)
    const lf = this.latestHealth?.load_focus;
    if (lf) {
      if (
        lf.low_aerobic_actual != null &&
        lf.low_aerobic_low != null &&
        lf.low_aerobic_actual < lf.low_aerobic_low
      ) {
        insights.push({
          icon: 'fas fa-walking',
          label: 'More Easy Work',
          text: `Low aerobic load (${Math.round(lf.low_aerobic_actual)}) is below target (${Math.round(lf.low_aerobic_low)}–${Math.round(lf.low_aerobic_high ?? 0)}) — add more easy/base sessions.`,
          color: '#1FA87A',
          level: 'warn'
        });
      }
      if (
        lf.high_aerobic_actual != null &&
        lf.high_aerobic_low != null &&
        lf.high_aerobic_actual < lf.high_aerobic_low
      ) {
        insights.push({
          icon: 'fas fa-fire',
          label: 'More Tempo Work',
          text: `High aerobic load (${Math.round(lf.high_aerobic_actual)}) is below target (${Math.round(lf.high_aerobic_low)}–${Math.round(lf.high_aerobic_high ?? 0)}) — add tempo or threshold sessions.`,
          color: UI_COLORS.accent,
          level: 'warn'
        });
      }
      if (
        lf.anaerobic_actual != null &&
        lf.anaerobic_high != null &&
        lf.anaerobic_actual > lf.anaerobic_high
      ) {
        insights.push({
          icon: 'fas fa-exclamation-triangle',
          label: 'Anaerobic Overload',
          text: `Anaerobic load (${Math.round(lf.anaerobic_actual)}) exceeds target ceiling (${Math.round(lf.anaerobic_high)}) — reduce high-intensity work.`,
          color: '#e63419',
          level: 'alert'
        });
      }
      if (
        lf.low_aerobic_actual != null &&
        lf.low_aerobic_high != null &&
        lf.high_aerobic_actual != null &&
        lf.high_aerobic_high != null &&
        lf.low_aerobic_actual >= lf.low_aerobic_low! &&
        lf.low_aerobic_actual <= lf.low_aerobic_high &&
        lf.high_aerobic_actual >= lf.high_aerobic_low! &&
        lf.high_aerobic_actual <= lf.high_aerobic_high
      ) {
        insights.push({
          icon: 'fas fa-balance-scale',
          label: 'Zones Balanced',
          text: 'Low aerobic and high aerobic loads are both within Garmin targets — great balance.',
          color: '#4caf50',
          level: 'good'
        });
      }
    }

    const loadBySportInsight = this.computeLoadBySportInsight(now);
    if (loadBySportInsight) {
      insights.push(loadBySportInsight);
    }

    const hrStrainInsight = this.computeHrStrainInsight(now);
    if (hrStrainInsight) {
      insights.push(hrStrainInsight);
    }

    // 4. Intensity distribution (last 28 days)
    const last28 = this.activities.filter((a) =>
      dayjs(a.start_date).isAfter(now.subtract(28, 'days'))
    );
    const withTE = last28.filter(
      (a) => a.trainingEffect != null && a.trainingEffect > 0
    );
    if (withTE.length >= 4) {
      const hardLabels = [
        'VO2MAX',
        'HIGH_AEROBIC',
        'ANAEROBIC_CAPACITY',
        'SPRINT',
        'OVERREACHING'
      ];
      const hard = withTE.filter(
        (a) =>
          a.trainingEffectLabel && hardLabels.includes(a.trainingEffectLabel)
      ).length;
      const hardPct = Math.round((hard / withTE.length) * 100);
      const easyPct = 100 - hardPct;
      if (hardPct > 40) {
        insights.push({
          icon: 'fas fa-exclamation-triangle',
          label: 'Too Much Intensity',
          text: `${hardPct}% of sessions over 4 weeks were high-intensity. Aim for ~80% easy / 20% hard.`,
          color: '#ff8c00',
          level: 'warn'
        });
      } else if (hardPct < 10) {
        const status = this.latestHealth?.training_status?.replace(/_\d+$/, '');
        if (status !== 'RECOVERY') {
          insights.push({
            icon: 'fas fa-bolt',
            label: 'Add Intensity',
            text: `Only ${hardPct}% of sessions were high-intensity. Consider adding a tempo or VO₂ max effort.`,
            color: '#42a5f5',
            level: 'info'
          });
        }
      } else {
        insights.push({
          icon: 'fas fa-check-circle',
          label: 'Good Intensity Mix',
          text: `${easyPct}% easy / ${hardPct}% hard over the last 4 weeks — solid polarised distribution.`,
          color: '#4caf50',
          level: 'good'
        });
      }
    }

    // 5. Days since last activity
    if (this.latestActivity) {
      const daysSince = now.diff(dayjs(this.latestActivity.start_date), 'days');
      if (daysSince >= 7) {
        insights.push({
          icon: 'fas fa-bed',
          label: 'Long Break',
          text: `Last activity was ${daysSince} days ago — you may be losing recent fitness gains.`,
          color: '#adb5bd',
          level: 'warn'
        });
      } else if (daysSince >= 3) {
        insights.push({
          icon: 'fas fa-coffee',
          label: 'Rest Period',
          text: `${daysSince} days since your last session — good rest or recovery block.`,
          color: '#42a5f5',
          level: 'info'
        });
      }
    }

    // 6. VO2 max trend (last 5 snapshots)
    const vo2Snaps = this.healthSnapshots
      .filter((s) => s.vo2max_running != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-5);
    if (vo2Snaps.length >= 3) {
      const first = vo2Snaps[0].vo2max_running!;
      const last = vo2Snaps[vo2Snaps.length - 1].vo2max_running!;
      const diff = +(last - first).toFixed(1);
      if (diff >= 1) {
        insights.push({
          icon: 'fas fa-lungs',
          label: 'VO₂ Max Improving',
          text: `Running VO₂ max up ${diff} over recent snapshots (now ${last.toFixed(1)}) — aerobic fitness growing.`,
          color: '#4caf50',
          level: 'good'
        });
      } else if (diff <= -1) {
        insights.push({
          icon: 'fas fa-lungs',
          label: 'VO₂ Max Declining',
          text: `Running VO₂ max down ${Math.abs(diff)} (now ${last.toFixed(1)}) — consider more aerobic base work.`,
          color: '#ff8c00',
          level: 'warn'
        });
      }
    }

    return this.sortTrainingInsights(insights);
  }

  private sortTrainingInsights(insights: TrainingInsight[]): TrainingInsight[] {
    const severityRank: Record<TrainingInsight['level'], number> = {
      alert: 0,
      warn: 1,
      info: 2,
      good: 3
    };

    return insights
      .map((insight, index) => ({ insight, index }))
      .sort(
        (a, b) =>
          severityRank[a.insight.level] - severityRank[b.insight.level] ||
          a.index - b.index
      )
      .map(({ insight }) => insight);
  }

  private computeHighRiskInsight(now: Dayjs): TrainingInsight | null {
    const last7 = this.activities.filter((a) =>
      dayjs(a.start_date).isAfter(now.subtract(7, 'days'))
    );
    const prior21 = this.activities.filter((a) => {
      const d = dayjs(a.start_date);
      return (
        d.isAfter(now.subtract(28, 'days')) &&
        d.isSameOrBefore(now.subtract(7, 'days'))
      );
    });

    const last7Load = last7.reduce(
      (sum, a) => sum + (a.activityTrainingLoad ?? 0),
      0
    );
    const baseline7Load =
      prior21.reduce((sum, a) => sum + (a.activityTrainingLoad ?? 0), 0) / 3;
    const acuteLoadSpike =
      baseline7Load > 0 &&
      last7Load > baseline7Load * 1.3 &&
      last7Load - baseline7Load > 100;

    const highStrainSessions = last7.filter((a) =>
      this.isHighStrainActivity(a)
    );
    const hardDays = new Set(
      highStrainSessions.map((a) => dayjs(a.start_date).format('YYYY-MM-DD'))
    );
    const activeDays = new Set(
      last7.map((a) => dayjs(a.start_date).format('YYYY-MM-DD'))
    );
    const hardBackToBack = Array.from(hardDays).some((date) =>
      hardDays.has(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))
    );
    const lowRest = activeDays.size >= 6;
    const lowReadiness =
      this.todayReadinessHealth?.training_readiness?.score != null &&
      this.todayReadinessHealth.training_readiness.score < 50;
    const overreachingStatus =
      this.latestHealth?.training_status?.replace(/_\d+$/, '') ===
      'OVERREACHING';

    const factors: string[] = [];
    if (acuteLoadSpike) {
      factors.push(
        `7-day load ${Math.round(last7Load)} vs ${Math.round(baseline7Load)} baseline`
      );
    }
    if (highStrainSessions.length >= 3) {
      factors.push(`${highStrainSessions.length} hard sessions`);
    }
    if (hardBackToBack) {
      factors.push('back-to-back hard days');
    }
    if (lowRest) {
      factors.push(`${activeDays.size}/7 active days`);
    }
    if (lowReadiness) {
      factors.push('readiness < 50');
    }
    if (overreachingStatus) {
      factors.push('overreaching status');
    }

    if (factors.length < 2) {
      return null;
    }

    const isHighRisk =
      factors.length >= 3 || acuteLoadSpike || overreachingStatus;
    const factorText = factors.slice(0, 3).join('; ');
    return {
      icon: 'fas fa-heartbeat',
      label: isHighRisk ? 'High Risk' : 'Elevated Risk',
      text: `${factorText}. Keep the next session easy.`,
      color: isHighRisk ? '#e63419' : '#ff8c00',
      level: isHighRisk ? 'alert' : 'warn'
    };
  }

  private isHighStrainActivity(activity: Activity): boolean {
    const avgHr = activity.averageHR ?? 0;
    return (
      (activity.activityTrainingLoad ?? 0) >= 200 ||
      (activity.trainingEffect ?? 0) >= 4 ||
      (activity.anaerobicTrainingEffect ?? 0) >= 3 ||
      avgHr >= this.tanakaMaxHr * 0.85
    );
  }

  private computeLoadBySportInsight(now: Dayjs): TrainingInsight | null {
    const recent = this.activities.filter(
      (a) =>
        dayjs(a.start_date).isAfter(now.subtract(7, 'days')) &&
        a.activityTrainingLoad != null &&
        a.activityTrainingLoad > 0
    );
    const totalLoad = recent.reduce(
      (sum, a) => sum + (a.activityTrainingLoad ?? 0),
      0
    );
    if (recent.length < 2 || totalLoad <= 0) return null;

    const loadBySport = new Map<string, number>();
    for (const activity of recent) {
      const sportKey = this.assessmentSportKey(activity);
      loadBySport.set(
        sportKey,
        (loadBySport.get(sportKey) ?? 0) + (activity.activityTrainingLoad ?? 0)
      );
    }

    const [sport, load] = Array.from(loadBySport.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];
    const pct = Math.round((load / totalLoad) * 100);
    if (pct < 45) return null;

    const label = this.formatSportLabel(sport);
    return {
      icon: this.sportIcon(sport),
      label: 'Load By Sport',
      text: `${label} accounts for ${pct}% of 7-day load (${Math.round(load)} of ${Math.round(totalLoad)}).`,
      color: UI_COLORS.accent,
      level: pct >= 70 ? 'warn' : 'info'
    };
  }

  private computeHrStrainInsight(now: Dayjs): TrainingInsight | null {
    const recent = this.activities
      .filter(
        (a) =>
          a.averageHR != null &&
          dayjs(a.start_date).isAfter(now.subtract(90, 'days'))
      )
      .sort(
        (a, b) => dayjs(b.start_date).valueOf() - dayjs(a.start_date).valueOf()
      );
    const latest = recent[0];
    if (!latest?.averageHR) return null;

    const baseline = recent
      .slice(1)
      .filter(
        (a) =>
          this.assessmentSportKey(a) === this.assessmentSportKey(latest) &&
          a.averageHR != null
      )
      .slice(0, 10);
    if (baseline.length < 3) return null;

    const avgBaselineHr =
      baseline.reduce((sum, a) => sum + (a.averageHR ?? 0), 0) /
      baseline.length;
    const diff = Math.round(latest.averageHR - avgBaselineHr);
    if (diff < 8) return null;

    const label = this.formatSportLabel(this.assessmentSportKey(latest));
    return {
      icon: 'fas fa-heartbeat',
      label: 'HR Strain Outlier',
      text: `Latest ${label.toLowerCase()} averaged ${Math.round(latest.averageHR)} bpm, ${diff} above recent ${label.toLowerCase()} baseline.`,
      color: diff >= 15 ? '#e63419' : '#ff8c00',
      level: diff >= 15 ? 'alert' : 'warn'
    };
  }

  private formatSportLabel(activityType: string): string {
    const labels: Record<string, string> = {
      run: 'Running',
      ride: 'Cycling',
      swim: 'Swimming',
      walk: 'Walking',
      football: 'Football',
      other: 'Other'
    };
    return labels[activityType] ?? activityType;
  }

  private assessmentSportKey(activity: Activity): string {
    const name = activity.name.toLowerCase();
    if (name.includes('football') || name.includes('soccer')) {
      return 'football';
    }
    return activity.activity_type;
  }

  private sportIcon(activityType: string): string {
    const icons: Record<string, string> = {
      run: 'fas fa-running',
      ride: 'fas fa-biking',
      swim: 'fas fa-swimmer',
      walk: 'fas fa-walking',
      football: 'fas fa-futbol'
    };
    return icons[activityType] ?? 'fas fa-dumbbell';
  }
}
