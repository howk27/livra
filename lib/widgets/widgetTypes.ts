export interface WidgetMarkData {
  id: string;
  name: string;
  icon: string;   // emoji string, e.g. "💪" — or empty string if unavailable
  color: string;  // hex, e.g. "#10B981"
  completed: boolean;
}

export interface WidgetData {
  activeGoalTitle: string | null;
  /** Goal emoji shown at the center of the widget ring. Empty string when unset. */
  goalIcon: string;
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
