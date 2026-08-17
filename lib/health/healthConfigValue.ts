// lib/health/healthConfigValue.ts
//
// Parse, validate and phrase the two editable HealthKit thresholds.
//
// Pure on purpose: mark detail is a 1,100-line screen and this is the part
// worth pinning with tests. The screen owns the sheet; this owns what counts
// as a valid number and how the number is said out loud.

import { STEP_GOAL_FALLBACK, SLEEP_HOURS_DEFAULT } from './healthDefaults';

/** The health types that carry a user-editable threshold. Workouts do not:
 *  a workout either exists in Health that day or it does not. */
export type HealthValueKind = 'steps' | 'sleep';

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const SLEEP_MIN_HOURS = 1;
const SLEEP_MAX_HOURS = 24;
const STEP_MIN = 1;
const STEP_MAX = 200_000;

/** Group thousands without depending on Intl being present in Hermes. */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Drop a trailing .0 so 7 reads "7" and 6.5 reads "6.5". */
function trimHours(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

/** The threshold currently in force for a binding, defaults included. Read
 *  this rather than the raw config so the screen and the sync agree. */
export function resolveHealthValue(
  kind: HealthValueKind,
  config: { stepGoal?: number; sleepHours?: number } | null | undefined,
): number {
  if (kind === 'steps') return config?.stepGoal ?? STEP_GOAL_FALLBACK;
  return config?.sleepHours ?? SLEEP_HOURS_DEFAULT;
}

/** Merge an edited threshold into a binding config without dropping the other
 *  key. Manual connects write `config: null` for sleep, so this must also cope
 *  with there being no object at all. */
export function withHealthValue(
  kind: HealthValueKind,
  config: { stepGoal?: number; sleepHours?: number } | null | undefined,
  value: number,
): { stepGoal?: number; sleepHours?: number } {
  const next = { ...(config ?? {}) };
  if (kind === 'steps') next.stepGoal = value;
  else next.sleepHours = value;
  return next;
}

export function parseHealthValue(kind: HealthValueKind, raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: kind === 'steps' ? 'Enter a step goal.' : 'Enter a number of hours.' };
  }

  // Number() rather than parseInt/parseFloat: those stop at the first bad
  // character, so "8000abc" would silently become 8000.
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'Enter a number.' };
  }

  if (kind === 'steps') {
    if (!Number.isInteger(n)) return { ok: false, error: 'Enter a whole number of steps.' };
    if (n < STEP_MIN || n > STEP_MAX) {
      return { ok: false, error: `Enter a step goal between ${groupThousands(STEP_MIN)} and ${groupThousands(STEP_MAX)}.` };
    }
    return { ok: true, value: n };
  }

  if (n < SLEEP_MIN_HOURS || n > SLEEP_MAX_HOURS) {
    return { ok: false, error: `Enter a number of hours between ${SLEEP_MIN_HOURS} and ${SLEEP_MAX_HOURS}.` };
  }
  // One decimal is as fine as this gets: the reader compares against
  // hours * 3,600,000 ms, so 6.5 is meaningful and 6.5333 is noise.
  return { ok: true, value: Number(n.toFixed(1)) };
}

/** The value alone, for an input's starting text. */
export function healthValueInputText(kind: HealthValueKind, value: number): string {
  return kind === 'steps' ? String(value) : trimHours(value);
}

/** The value said out loud, for the row's meta line. */
export function describeHealthValue(kind: HealthValueKind, value: number): string {
  if (kind === 'steps') {
    return `A day counts at ${groupThousands(value)} steps.`;
  }
  const hours = trimHours(value);
  return `A night counts at ${hours} ${value === 1 ? 'hour' : 'hours'} of sleep.`;
}

/** Row label. */
export function healthValueLabel(kind: HealthValueKind): string {
  return kind === 'steps' ? 'Step goal' : 'Sleep target';
}

/** Sheet question. */
export function healthValuePrompt(kind: HealthValueKind): string {
  return kind === 'steps'
    ? 'How many steps counts as an active day?'
    : 'How many hours of sleep counts as a night?';
}
