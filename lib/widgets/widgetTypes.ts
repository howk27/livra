export interface WidgetMarkData {
  id: string;
  name: string;
  icon: string;   // emoji string, e.g. "💪" — or empty string if unavailable
  color: string;  // hex, e.g. "#10B981"
  completed: boolean;
}

export interface WidgetData {
  activeGoalTitle: string | null;
  marks: WidgetMarkData[];
  completedCount: number;
  totalCount: number;
  lastUpdated: number;  // Unix ms timestamp
  isPro: boolean;
}

export const APP_GROUP_ID = 'group.com.livra.app';
export const WIDGET_DATA_KEY = 'livra_widget_data';
