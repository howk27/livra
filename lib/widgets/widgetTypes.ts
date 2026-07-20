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
}

export interface PendingWidgetLog {
  markId: string;
  at: number; // Unix ms
}

export const APP_GROUP_ID = 'group.com.livra.app';
export const WIDGET_DATA_KEY = 'livra_widget_data';
export const PENDING_LOGS_KEY = 'livra_pending_logs';
