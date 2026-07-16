export interface WidgetMarkData {
  id: string;
  name: string;
  /** Bundled imageset name for the mark's category glyph (never a raw emoji). */
  icon: string;
  /** Category accent hex, e.g. "#4A8C7A". */
  accent: string;
  completed: boolean;
}

export interface WidgetData {
  activeGoalTitle: string | null;
  /** Imageset name for the goal glyph — the majority category across its marks. */
  goalIcon: string;
  /** Accent hex for the goal icon + ring. */
  goalAccent: string;
  /** Linked increment events counted toward the active goal (ring numerator). */
  goalProgress: number;
  /** Unlock threshold for the active goal (ring denominator). Always ≥ 1. */
  goalThreshold: number;
  marks: WidgetMarkData[];
  completedCount: number;
  totalCount: number;
  lastUpdated: number;  // Unix ms timestamp
  isPro: boolean;
}

/** A single one-tap log written by the widget's AppIntent, pending app reconciliation. */
export interface PendingWidgetLog {
  markId: string;
  at: number; // Unix ms timestamp of the widget tap
}

export const APP_GROUP_ID = 'group.com.livra.app';
export const WIDGET_DATA_KEY = 'livra_widget_data';
/** App Group key holding the queue of logs tapped in the widget but not yet applied in-app. */
export const PENDING_LOGS_KEY = 'livra_pending_logs';
