// lib/analytics/events.ts
// Event taxonomy contract — one entry per PRODUCT.md "North-Star & Success Metrics" signal.
// object_action, snake_case. Add properties to an existing event before adding a new one.
export const ANALYTICS_EVENTS = {
  /** North star: real goals finished. */
  GOAL_COMPLETED: 'goal_completed',
  GOAL_CREATED: 'goal_created',
  /** Core-loop usage signal. Property `gap_days` feeds "return after a missed day". */
  MARK_LOGGED: 'mark_logged',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  /** Free -> Livra+ at a real limit. */
  PAYWALL_VIEWED: 'paywall_viewed',
  SUBSCRIPTION_STARTED: 'subscription_started',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
