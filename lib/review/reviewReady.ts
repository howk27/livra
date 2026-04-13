import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { getAppDate } from '../appDate';

const LAST_OPENED_KEY = 'livra_weekly_review_opened_at';
const LAST_DISMISSED_KEY = 'livra_weekly_review_prompt_dismissed_at';

const toLocalDay = (date: Date): string => format(date, 'yyyy-MM-dd');

export type ReviewReadyState = {
  shouldPrompt: boolean;
  reason: 'new_week' | 'activity_threshold' | 'recent_activity' | 'none';
};

export const getReviewReadyState = (params: {
  weekStart: string;
  totalActivity: number;
  daysActive: number;
  lastOpenedAt?: string | null;
  lastDismissedAt?: string | null;
}): ReviewReadyState => {
  const { weekStart, totalActivity, daysActive, lastOpenedAt, lastDismissedAt } = params;
  if (totalActivity === 0) {
    return { shouldPrompt: false, reason: 'none' };
  }

  const today = toLocalDay(getAppDate());
  if (lastDismissedAt && toLocalDay(new Date(lastDismissedAt)) === today) {
    return { shouldPrompt: false, reason: 'none' };
  }

  const openedWeekStart = lastOpenedAt
    ? toLocalDay(new Date(lastOpenedAt)) >= weekStart
    : false;

  if (!openedWeekStart) {
    return { shouldPrompt: true, reason: 'new_week' };
  }

  if (totalActivity >= 3 || daysActive >= 2) {
    return { shouldPrompt: true, reason: 'activity_threshold' };
  }

  return { shouldPrompt: false, reason: 'none' };
};

export const getReviewPromptState = async (params: {
  weekStart: string;
  totalActivity: number;
  daysActive: number;
}): Promise<ReviewReadyState> => {
  const [lastOpenedAt, lastDismissedAt] = await Promise.all([
    AsyncStorage.getItem(LAST_OPENED_KEY),
    AsyncStorage.getItem(LAST_DISMISSED_KEY),
  ]);
  return getReviewReadyState({
    ...params,
    lastOpenedAt,
    lastDismissedAt,
  });
};

export const markWeeklyReviewOpened = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_OPENED_KEY, new Date().toISOString());
  } catch {
    // Best effort
  }
};

export const dismissWeeklyReviewPrompt = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_DISMISSED_KEY, new Date().toISOString());
  } catch {
    // Best effort
  }
};
