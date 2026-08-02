export interface WidgetMarkData {
  id: string;
  name: string;
  icon: string;    // bundled imageset name, e.g. "livra_moon"
  accent: string;  // category accent hex, e.g. "#4A8C7A"
  completed: boolean;
}

export interface WidgetGoalData {
  id: string;
  title: string | null;
  icon: string;      // bundled imageset name for the goal's majority-category glyph
  accent: string;    // majority-category accent hex
  progress: number;  // DAYS toward the goal's unlock threshold
  threshold: number; // total days the goal requires (>= 1)
  marks: WidgetMarkData[];
}

export interface WidgetData {
  goals: WidgetGoalData[]; // active goals in getActiveGoals (sort_index) order; cap 4
  lastUpdated: number;     // Unix ms timestamp
  isPro: boolean;
  // The APP's effective theme, not the phone's. WidgetKit only ever sees the
  // system appearance, so before this field a user who forced the app to light
  // on a dark phone got a dark widget beside a light app. Founder ruling
  // 2026-08-02: the widget follows the app's setting. Swift treats it as
  // optional and falls back to the system trait, so an older snapshot still on
  // disk renders exactly as it does today.
  theme: 'light' | 'dark';
}

export interface PendingWidgetLog {
  markId: string;
  at: number; // Unix ms
}

export const APP_GROUP_ID = 'group.com.livra.app';
export const WIDGET_DATA_KEY = 'livra_widget_data';
export const PENDING_LOGS_KEY = 'livra_pending_logs';
