// lib/weeklyReview/arrival.ts
// WR-3 — when the Weekly Review card appears on Focus, and the viewed state
// that clears it (spec 2026-08-29 §5). The card is dismissable BY VIEWING
// only: opening the review records the reviewed weekStart, and the card stays
// gone until the next week's review arrives. Device-scoped, wiped on sign-out
// (registered in lib/purgeLocalUserData.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { weekPositionOf } from '../moments/context';
import { reviewWeekStart } from './derive';

export const WEEKLY_REVIEW_VIEWED_KEY = '@livra_weekly_review_viewed';

/** Sunday 19:00 local — the card and the notification share the moment. */
export const WEEKLY_REVIEW_ARRIVAL_HOUR = 19;

export async function getWeeklyReviewViewedWeek(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WEEKLY_REVIEW_VIEWED_KEY);
  } catch {
    return null;
  }
}

export async function setWeeklyReviewViewedWeek(weekStart: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WEEKLY_REVIEW_VIEWED_KEY, weekStart);
  } catch {
    // Best effort — a failed write only means the card lingers until reopened.
  }
}

export type WeeklyReviewCardInputs = {
  /** 'yyyy-MM-dd' */
  todayStr: string;
  /** Device-local hour, 0–23. */
  hour: number;
  /** The weekStart last recorded by the review screen; null = never viewed. */
  viewedWeekStart: string | null;
  hasActiveGoals: boolean;
};

/**
 * Pure visibility: from Sunday 19:00 until the review is opened or the
 * display window ends. The window mirrors reviewWeekStart — Sunday evening
 * shows the closing week, Monday and Tuesday still show it (lookback), and
 * Wednesday the slate is clean until the next Sunday evening.
 */
export function shouldShowWeeklyReviewCard(i: WeeklyReviewCardInputs): boolean {
  if (!i.hasActiveGoals) return false;
  const pos = weekPositionOf(i.todayStr); // 0 = Monday … 6 = Sunday
  const arrived =
    pos <= 1 || (pos === 6 && i.hour >= WEEKLY_REVIEW_ARRIVAL_HOUR);
  if (!arrived) return false;
  return i.viewedWeekStart !== reviewWeekStart(i.todayStr);
}

/**
 * The card's single line. Numbers ride along only when there are real ones —
 * a zero is never rendered (ux-psychology rule 2).
 */
export function weeklyReviewCardLine(daysActiveCount: number, marksLogged: number): string {
  if (daysActiveCount <= 0 || marksLogged <= 0) return 'Your week is ready.';
  const days = `${daysActiveCount} ${daysActiveCount === 1 ? 'day' : 'days'}`;
  const marks = `${marksLogged} ${marksLogged === 1 ? 'mark' : 'marks'}`;
  return `Your week is ready · ${days}, ${marks}`;
}
