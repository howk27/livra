// lib/features.ts
// Pure helper functions for all 5 features. No side effects.

import type { Mark, MarkEvent, DayOfWeek, GoalPeriod, Milestone } from '../types';
import { STREAK_MILESTONES } from '../types';

// ── Date utils ────────────────────────────────────────────

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

function startOfWeekISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Feature 1: Goal Progress ──────────────────────────────

export function getPeriodTotal(events: MarkEvent[], markId: string, period: GoalPeriod): number {
  const today = todayISO();
  const from = period === 'day' ? today : period === 'week' ? startOfWeekISO() : startOfMonthISO();
  return events
    .filter(e => e.mark_id === markId && !e.deleted_at && e.event_type === 'increment' && e.occurred_local_date >= from && e.occurred_local_date <= today)
    .reduce((sum, e) => sum + (e.amount ?? 1), 0);
}

export function getGoalProgress(events: MarkEvent[], mark: Mark): number | null {
  if (!mark.goal_value || !mark.goal_period) return null;
  const current = getPeriodTotal(events, mark.id, mark.goal_period as GoalPeriod);
  return Math.min(current / mark.goal_value, 1);
}

export function getGoalLabel(events: MarkEvent[], mark: Mark): string | null {
  if (!mark.goal_value || !mark.goal_period) return null;
  const current = getPeriodTotal(events, mark.id, mark.goal_period as GoalPeriod);
  const periodLabel = mark.goal_period === 'day' ? 'per day' : mark.goal_period === 'week' ? 'per week' : 'per month';
  return `${current} / ${mark.goal_value} ${periodLabel}`;
}

// ── Feature 2: Schedule ───────────────────────────────────

export function parseScheduleDays(mark: Mark): DayOfWeek[] {
  try {
    if (!mark.schedule_days) return [];
    return JSON.parse(mark.schedule_days) as DayOfWeek[];
  } catch { return []; }
}

export function isMarkActiveOnDate(mark: Mark, date: Date = new Date()): boolean {
  const type = mark.schedule_type ?? 'daily';
  if (type === 'daily') return true;
  const days = parseScheduleDays(mark);
  if (days.length === 0) return true;
  return days.includes(date.getDay() as DayOfWeek);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getScheduleLabel(mark: Mark): string {
  const type = mark.schedule_type ?? 'daily';
  if (type === 'daily') return 'Every day';
  if (type === 'weekly') return 'Once a week';
  const days = parseScheduleDays(mark);
  if (days.length === 0) return 'Every day';
  return days.map(d => DAY_NAMES[d]).join(' · ');
}

// ── Feature 3: Skip Tokens ────────────────────────────────

export function getEffectiveSkipTokens(mark: Mark): number {
  const current = currentMonthISO();
  if (mark.skip_tokens_month !== current) return 2;
  return mark.skip_tokens_remaining ?? 2;
}

// ── Streak Milestones ─────────────────────────────────────

export function getMilestoneForStreak(streak: number): Milestone | null {
  const crossed = STREAK_MILESTONES.filter(m => streak >= m.days);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function getNextMilestone(streak: number): Milestone | null {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? null;
}

export function justReachedMilestone(prevStreak: number, currStreak: number): Milestone | null {
  const prev = getMilestoneForStreak(prevStreak);
  const curr = getMilestoneForStreak(currStreak);
  if (curr && curr.days !== prev?.days) return curr;
  return null;
}

// ── Feature 5: Backup ─────────────────────────────────────

export type BackupPayload = {
  version: number;
  exported_at: string;
  marks: any[];
  events: any[];
  streaks: any[];
  notes: any[];
};

export function buildBackupPayload(marks: any[], events: any[], streaks: any[], notes: any[]): BackupPayload {
  return { version: 1, exported_at: new Date().toISOString(), marks, events, streaks, notes };
}

export function validateBackupPayload(raw: unknown): raw is BackupPayload {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as any;
  return p.version === 1 && typeof p.exported_at === 'string' && Array.isArray(p.marks) && Array.isArray(p.events) && Array.isArray(p.streaks) && Array.isArray(p.notes);
}
