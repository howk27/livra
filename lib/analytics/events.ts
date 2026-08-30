// lib/analytics/events.ts
// Event taxonomy contract — one entry per PRODUCT.md "North-Star & Success Metrics" signal.
// object_action, snake_case. Add properties to an existing event before adding a new one.
export const ANALYTICS_EVENTS = {
  /**
   * Post-onboarding AI plan flow (FU-6). Properties:
   * source: 'goals' | 'goal_create_fallback' · confidence: 'high' | 'low' | null
   * outcome: 'confirmed' | 'dismissed' | 'exhausted' | 'saved' | 'resumed'
   */
  AI_PLAN_SUGGESTED: 'ai_plan_suggested',
  /** North star: real goals finished. */
  GOAL_COMPLETED: 'goal_completed',
  /** Property `method: 'manual' | 'ai'` distinguishes creation path (PRD §8). */
  GOAL_CREATED: 'goal_created',
  /** Core-loop usage signal. Properties: `gap_days` feeds "return after a
   *  missed day" · `voice_line_shown: boolean` (PL-4) marks logs where the
   *  moment engine rendered a post-log voice line. */
  MARK_LOGGED: 'mark_logged',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  /** Free -> Livra+ at a real limit. */
  PAYWALL_VIEWED: 'paywall_viewed',
  SUBSCRIPTION_STARTED: 'subscription_started',
  /** Auth funnel — distinguishes returning vs new users. */
  USER_SIGNED_IN: 'user_signed_in',
  USER_SIGNED_UP: 'user_signed_up',
  /** WR-5: the Mark → Reflect → Review loop closing. Properties:
   *  source: 'notification' | 'focus_card' | 'other' · week_start ·
   *  days_active · marks_logged · first_week: boolean */
  WEEKLY_REVIEW_OPENED: 'weekly_review_opened',
  /** WR-5: the Livra+ tease footer tapped. Property: week_start. */
  WEEKLY_REVIEW_PAYWALL_TAPPED: 'weekly_review_paywall_tapped',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
