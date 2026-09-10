// lib/analytics/screenParams.ts
//
// Route params are NOT safe to send to analytics wholesale.
//
// app/_layout.tsx tracks screens with `screenTrack(pathname, { ...params })`,
// where `params` is `useGlobalSearchParams()`. Several routes carry
// USER-AUTHORED FREE TEXT in their params — `goalText` (app/goal/new.tsx:291,
// the goal the user typed), `title` (app/goal/new.tsx:223) and `goalTitle`
// (app/goal/[id].tsx:1307, app/_layout.tsx:247) — so the spread shipped the
// user's own goal wording to PostHog as a `$screen` property. Confirmed live on
// 2026-09-10: 6 events carrying `goalText` and 3 carrying `title`.
//
// app/auth/reset-password-complete.tsx:42 also declares a `token` param. It has
// NEVER been captured (verified live: 0 events) because the screen validates via
// getSession() rather than reading it, but a URL carrying one would have been
// picked up by the same spread. That is the reason this is an ALLOWLIST and not
// a denylist: a denylist only blocks the leaks we already thought of, and the
// next param someone adds is private by default under this rule.
//
// Keys here must be non-secret and low-cardinality-by-nature: enums, flags, and
// the user's own resource ids (which already ride goal_id / mark_id on other
// events). Never add a key that can hold text a user typed.
const SAFE_SCREEN_PARAM_KEYS: readonly string[] = [
  'source', // enum: how a screen was reached ('focus_card' | 'notification' | ...)
  'openReview', // flag routed through Focus to open the Weekly Review
  'milestoneKey', // enum-ish milestone identifier
  'type', // auth callback type ('recovery' | ...)
  'id', // the user's own goal/mark id
  'goalId',
  'logMarkId',
];

/**
 * Reduce route params to the keys that are safe to attach to a `$screen` event.
 *
 * Fail-closed: anything not explicitly listed is dropped, including keys added
 * to routes in future. Values are passed through untouched — the allowlist is
 * about WHICH key, not about scrubbing a value.
 */
export function safeScreenParams(
  params: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!params) return {};
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_SCREEN_PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined) safe[key] = value;
  }
  return safe;
}

export const __SAFE_SCREEN_PARAM_KEYS_FOR_TEST = SAFE_SCREEN_PARAM_KEYS;
