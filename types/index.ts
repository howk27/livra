// Goal & schedule types must be declared before Mark
export type GoalPeriod = 'day' | 'week' | 'month';
export type ScheduleType = 'daily' | 'weekly' | 'custom';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type Mark = {
  id: string;
  user_id: string;
  name: string;
  emoji?: string;
  color?: string;
  unit: 'sessions' | 'days' | 'items';
  enable_streak: boolean;
  sort_index: number;
  total: number;
  last_activity_date?: string; // YYYY-MM-DD
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // Feature 1: Habit Goals
  goal_value?: number | null;
  /** Taps/increments needed to complete this mark today; default 1 when unset */
  dailyTarget?: number | null;
  goal_period?: 'day' | 'week' | 'month' | null;
  // Feature 2: Flexible Schedules
  schedule_type?: 'daily' | 'weekly' | 'custom';
  schedule_days?: string; // JSON array string e.g. "[1,3,5]"  (0=Sunday)
  // Feature 3: Skip Tokens
  skip_tokens_remaining?: number;  // default 2, reset monthly
  skip_tokens_month?: string;      // "YYYY-MM" of last reset
};

export type MarkEvent = {
  id: string;
  user_id: string;
  mark_id: string;
  event_type: 'increment' | 'reset' | 'decrement';
  amount: number;
  occurred_at: string; // ISO
  occurred_local_date: string; // YYYY-MM-DD
  meta?: Record<string, unknown>;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type MarkStreak = {
  id: string;
  user_id: string;
  mark_id: string;
  current_streak: number;
  longest_streak: number;
  last_increment_date?: string; // YYYY-MM-DD
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type BadgeCode = 'habit_spark' | 'momentum_wave' | 'focus_forge';

export type MarkBadge = {
  id: string;
  user_id: string;
  mark_id: string;
  badge_code: BadgeCode;
  progress_value: number;
  target_value: number;
  earned_at?: string | null; // ISO
  last_progressed_at?: string | null; // ISO
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  created_at: string;
  display_name?: string;
  pro_unlocked: boolean;
  pro_unlocked_at?: string;
};

export type SortOption = 'recent' | 'total' | 'az' | 'streak';

export type ThemeMode = 'light' | 'dark' | 'system';

export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'pink';

// Feature 4: Daily tracking log — one saved row per (user_id, mark_id, local calendar date)
export type MarkNote = {
  id: string;
  mark_id: string;
  user_id: string;
  date: string;       // YYYY-MM-DD
  text: string;
  created_at: string;
  updated_at: string;
};

/** Alias: persisted note attached to that day’s tracking record (same storage as MarkNote). */
export type DailyTrackingLogEntry = MarkNote;

// Feature 3: Skip Token records
export type SkipToken = {
  id: string;
  mark_id: string;
  user_id: string;
  protected_date: string; // YYYY-MM-DD
  created_at: string;
};

// Streak Milestones
export type Milestone = {
  days: number;
  label: string;
  emoji: string;
};

export const STREAK_MILESTONES: Milestone[] = [
  { days: 3,   label: 'Getting started', emoji: '🌱' },
  { days: 7,   label: 'One week strong', emoji: '⚡' },
  { days: 14,  label: 'Two weeks solid', emoji: '🔥' },
  { days: 21,  label: 'Habit forming',   emoji: '🧠' },
  { days: 30,  label: 'One month!',      emoji: '🏆' },
  { days: 60,  label: 'Unstoppable',     emoji: '💎' },
  { days: 100, label: 'Elite tier',      emoji: '🚀' },
];

export function getMilestoneForStreak(streak: number): Milestone | null {
  const crossed = STREAK_MILESTONES.filter(m => streak >= m.days);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function getNextMilestone(streak: number): Milestone | null {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? null;
}

// Type aliases for backwards compatibility
export type Counter = Mark;
export type CounterEvent = MarkEvent;
export type CounterStreak = MarkStreak;
