export interface WidgetMarkData {
  id: string;
  name: string;
  icon: string;    // bundled imageset name, e.g. "livra_moon"
  accent: string;  // category accent hex, e.g. "#4A8C7A"
  completed: boolean;
}

export interface WidgetData {
  activeGoalTitle: string | null;
  goalIcon: string;       // bundled imageset name for the active goal's category glyph
  goalAccent: string;     // active goal's category accent hex
  goalProgress: number;   // days/units completed toward the goal
  goalThreshold: number;  // total days/units the goal requires
  marks: WidgetMarkData[];
  completedCount: number;
  totalCount: number;
  lastUpdated: number;    // Unix ms timestamp
  isPro: boolean;
}

export interface PendingWidgetLog {
  markId: string;
  at: number; // Unix ms
}

export const APP_GROUP_ID = 'group.com.livra.app';
export const WIDGET_DATA_KEY = 'livra_widget_data';
export const PENDING_LOGS_KEY = 'livra_pending_logs';
