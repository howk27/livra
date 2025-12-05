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

// Type aliases for backwards compatibility
export type Counter = Mark;
export type CounterEvent = MarkEvent;
export type CounterStreak = MarkStreak;

