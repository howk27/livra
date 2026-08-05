// lib/health/autoSync.ts
//
// Health auto-sync engine (health-auto-sync T3, spec
// docs/superpowers/specs/2026-08-05-health-auto-sync-design.md §2).
//
// PURE-AS-POSSIBLE BY DESIGN. Everything environmental is injected: the gates
// (Pro / connected / toggle — checked by the CALLER's wiring in T4, but taken
// here as an explicit config object so the engine's own behaviour is honest),
// the bindings map, the already-logged amounts, the daily targets, the
// HealthKit readers, and — most importantly — the check-in writer. The engine
// DECIDES (which day, what amount, quiet or speaking); the writer, supplied by
// the caller from the app's real write path (`buildAutoSyncCheckinRow` →
// `useLogCheckinMutation`), EXECUTES. Voice suppression is therefore a
// per-write PARAMETER (`quiet`), never a global: past days catch up silently,
// today's log speaks exactly like a manual tap (spec §2.7).
//
// IDEMPOTENCE IS DAY-LEVEL AND DOUBLE-LOCKED. The watermark advances only to
// YESTERDAY, so today is re-scanned on every run (steps accumulate through the
// day); what makes the re-scan safe is the already-closed check — a day at or
// past its dailyTarget is never written to, whether it was closed manually, by
// a previous sync, or half-and-half. A manually closed day is untouched; a
// partially tapped day is topped up to closed with ONE row (spec §2.6).
//
// WEEK CREDIT (the repo's worst regression family): week credit is DERIVED
// (computeCompletionsThisWeek → markWeeklyState), and this engine only ever
// ADDS increment events — so a catch-up landing in an already-credited week can
// only grow the completion count, never flip 'doneForWeek' back to 'due'.
// Pinned in tests/unit/health/autoSync.test.ts (acceptance 7).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { formatDate } from '../date';
import { getAppDate, getAppDateTime } from '../appDate';
import { buildCheckinRow } from '../data/mutations/checkins';
import type { MarkEventRow } from '../data/types';
import {
  readWorkoutDays,
  readRunningDays,
  readMindfulDays,
  readStepDays,
  readSleepQualifiedDays,
} from './healthReader';
import type { HealthKitBinding } from './healthKitBinding';
import type { HealthKitType } from './healthTypes';

/** Account-scoped: registered in ACCOUNT_SCOPED_STORAGE_KEYS
 * (lib/purgeLocalUserData.ts) — a new sign-in must not inherit another
 * account's watermark or connect day, exactly like 'last_synced_at'. */
export const HEALTH_AUTO_SYNC_STATE_KEY = 'livra_health_auto_sync_state_v1';

/** Catch-up cap: the window floor is today − 6 → at most 7 days incl. today
 * (spec §2.3). A user away longer resumes forward from there. */
const CATCH_UP_LOOKBACK_DAYS = 6;

const STEP_GOAL_FALLBACK = 8000;
const SLEEP_HOURS_DEFAULT = 7;

/**
 * Which binding types the engine may write for. Exhaustive over HealthKitType
 * in this SHIPPED module (tsconfig excludes tests/**, so a Record guard in a
 * test file is inert — repo memory): a new type refuses to compile until it is
 * classified here. `hydration: false` is a spec non-goal — one water sample
 * must not close a multi-tap day (spec §4).
 */
const AUTO_SYNCABLE: Record<HealthKitType, boolean> = {
  workout: true,
  running: true,
  mindful: true,
  steps: true,
  sleep: true,
  hydration: false,
};

// ─── Device state: connect day + watermark ──────────────────────────────────

export interface AutoSyncState {
  /** Local date Health was connected — the forward-only floor. */
  connectDay: string | null;
  /** Last FINALIZED (past) day the engine scanned. Never today: today's data
   * is still accruing, so today is re-scanned every run. */
  lastSyncedDay: string | null;
}

async function loadState(): Promise<AutoSyncState> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_AUTO_SYNC_STATE_KEY);
    if (!raw) return { connectDay: null, lastSyncedDay: null };
    const parsed = JSON.parse(raw) as Partial<Record<keyof AutoSyncState, unknown>>;
    const day = (v: unknown): string | null =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    return { connectDay: day(parsed?.connectDay), lastSyncedDay: day(parsed?.lastSyncedDay) };
  } catch {
    return { connectDay: null, lastSyncedDay: null };
  }
}

/** Never throws — a failed persist must not break a sync pass; the next run
 * simply re-derives (idempotence absorbs the repeat). Same contract as
 * setHealthKitBinding. */
async function saveState(state: AutoSyncState): Promise<void> {
  try {
    await AsyncStorage.setItem(HEALTH_AUTO_SYNC_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.warn('[autoSync] state persist failed:', error);
  }
}

export async function getAutoSyncState(): Promise<AutoSyncState> {
  return loadState();
}

/** First write wins: the connect day is a historical fact, and reconnecting
 * must not move the forward-only floor backwards OR forwards. T4 calls this at
 * Settings connect; runAutoSync also stamps it lazily for connections that
 * predate this feature (build 64), which keeps them forward-only from today. */
export async function recordHealthConnectDay(day: string): Promise<void> {
  const state = await loadState();
  if (state.connectDay) return;
  await saveState({ ...state, connectDay: day });
}

// ─── The window (pure) ──────────────────────────────────────────────────────

/** Local-noon day arithmetic — immune to DST edges shifting a date string. */
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return formatDate(new Date(y!, m! - 1, d! + delta, 12));
}

/**
 * The days to scan: max(connectDay, dayAfter(lastSyncedDay), today − 6) … today
 * (spec §2.3), ascending. Empty when Health was never connected or when the
 * floor lands past today. ISO yyyy-MM-dd strings compare correctly as strings.
 */
export function computeSyncWindow(params: {
  today: string;
  connectDay: string | null;
  lastSyncedDay: string | null;
}): string[] {
  const { today, connectDay, lastSyncedDay } = params;
  if (!connectDay) return [];
  let start = shiftDay(today, -CATCH_UP_LOOKBACK_DAYS);
  if (connectDay > start) start = connectDay;
  if (lastSyncedDay) {
    const afterWatermark = shiftDay(lastSyncedDay, 1);
    if (afterWatermark > start) start = afterWatermark;
  }
  const days: string[] = [];
  for (let day = start; day <= today; day = shiftDay(day, 1)) days.push(day);
  return days;
}

// ─── Qualification readers ──────────────────────────────────────────────────

/** Injectable for tests; defaults to the real HealthKit readers. Sleep goes
 * through the DURATION-THRESHOLD read (readSleepQualifiedDays) — the lenient
 * reflection read (readSleepDays) is deliberately not wired here (spec §2.4). */
export interface QualifiedDayReaders {
  workout(dates: string[]): Promise<Set<string>>;
  running(dates: string[]): Promise<Set<string>>;
  mindful(dates: string[]): Promise<Set<string>>;
  steps(dates: string[], stepGoal: number): Promise<Set<string>>;
  sleep(dates: string[], sleepHours: number): Promise<Set<string>>;
}

const DEFAULT_READERS: QualifiedDayReaders = {
  workout: readWorkoutDays,
  running: readRunningDays,
  mindful: readMindfulDays,
  steps: readStepDays,
  sleep: readSleepQualifiedDays,
};

function qualifiedDays(
  readers: QualifiedDayReaders,
  binding: HealthKitBinding,
  window: string[],
): Promise<Set<string>> {
  switch (binding.type) {
    case 'workout':
      return readers.workout(window);
    case 'running':
      return readers.running(window);
    case 'mindful':
      return readers.mindful(window);
    case 'steps':
      return readers.steps(window, binding.config?.stepGoal ?? STEP_GOAL_FALLBACK);
    case 'sleep':
      return readers.sleep(window, binding.config?.sleepHours ?? SLEEP_HOURS_DEFAULT);
    case 'hydration':
      // Filtered out before this is reached (AUTO_SYNCABLE); listed for the
      // switch's exhaustiveness.
      return Promise.resolve(new Set());
  }
}

// ─── The engine ─────────────────────────────────────────────────────────────

/** The caller's wiring answers each of these (T4); the engine only insists they
 * are all true. Named individually so a wrong wire is visible at the call site
 * rather than folded into one opaque boolean. */
export interface AutoSyncGates {
  isPro: boolean;
  healthConnected: boolean;
  autoSyncEnabled: boolean;
}

export interface AutoSyncWriteRequest {
  markId: string;
  /** Local date being closed (yyyy-MM-dd). */
  day: string;
  /** The top-up: dailyTarget minus what is already logged, never more. */
  amount: number;
  /** True for catch-up (past) days: credit lands, no voice, no celebration.
   * False exactly once per run at most — today — which speaks like a manual
   * log. Suppression is THIS parameter; there is no global. */
  quiet: boolean;
  source: 'health';
}

export interface RunAutoSyncOptions {
  userId: string;
  gates: AutoSyncGates;
  /** markId → binding, as `allHealthKitBindings()` returns it. Empty map = no-op. */
  bindings: Record<string, HealthKitBinding>;
  /** Live logged amount (summed increments, tombstones excluded) for a mark on
   * a local date — the caller reads its query cache. This is the already-closed
   * lock: at/past dailyTarget the day is never touched. */
  loggedAmount: (markId: string, day: string) => number;
  /** Taps that close the mark's day (resolveDailyTarget of the mark). */
  dailyTarget: (markId: string) => number;
  /** The app's real check-in write path. Throwing aborts the run; the watermark
   * then stays put so every unwritten day retries next run. */
  writeCheckin: (req: AutoSyncWriteRequest) => Promise<void>;
  /** Local today (yyyy-MM-dd); defaults to the app clock. */
  today?: string;
  /** Test seam; partial — anything omitted uses the real reader. */
  readers?: Partial<QualifiedDayReaders>;
}

export interface AutoSyncRunResult {
  ran: boolean;
  reason: 'gates' | 'no-bindings' | 'empty-window' | null;
  window: string[];
  writes: AutoSyncWriteRequest[];
  /** True when a write threw: the run stopped and the watermark was NOT
   * advanced, so the remaining days are retried by the next run. */
  writeFailed: boolean;
}

const noop = (reason: AutoSyncRunResult['reason']): AutoSyncRunResult => ({
  ran: false,
  reason,
  window: [],
  writes: [],
  writeFailed: false,
});

/**
 * One sync pass. Trigger cadence (launch/foreground, 15-min debounce) is the
 * CALLER's job (T4); calling this twice in a row is safe by construction —
 * the second pass finds every day already closed and writes nothing (spec §2.6,
 * pinned).
 */
export async function runAutoSync(opts: RunAutoSyncOptions): Promise<AutoSyncRunResult> {
  const { gates } = opts;
  if (!opts.userId || !gates.isPro || !gates.healthConnected || !gates.autoSyncEnabled) {
    return noop('gates');
  }

  const bound = Object.entries(opts.bindings).filter(([, b]) => AUTO_SYNCABLE[b.type]);
  if (bound.length === 0) return noop('no-bindings');

  const today = opts.today ?? formatDate(getAppDate());
  const state = await loadState();
  let connectDay = state.connectDay;
  if (!connectDay) {
    // Pre-2.0 connection with no recorded day: forward-only means from NOW.
    connectDay = today;
    await saveState({ ...state, connectDay });
  }

  const window = computeSyncWindow({ today, connectDay, lastSyncedDay: state.lastSyncedDay });
  if (window.length === 0) return { ...noop('empty-window'), ran: false };

  const readers: QualifiedDayReaders = { ...DEFAULT_READERS, ...opts.readers };
  const writes: AutoSyncWriteRequest[] = [];
  let writeFailed = false;

  for (const [markId, binding] of bound) {
    let days: Set<string>;
    try {
      days = await qualifiedDays(readers, binding, window);
    } catch (error) {
      // Readers promise quiet-empty, but a seam that throws must not kill the
      // pass for every other mark.
      logger.warn('[autoSync] reader failed — mark skipped this pass:', error);
      continue;
    }
    for (const day of window) {
      if (!days.has(day)) continue;
      const need = opts.dailyTarget(markId) - opts.loggedAmount(markId, day);
      if (need <= 0) continue; // closed (manually, by a prior sync, or both) — never touched
      const req: AutoSyncWriteRequest = {
        markId,
        day,
        amount: Math.floor(need),
        quiet: day !== today,
        source: 'health',
      };
      try {
        await opts.writeCheckin(req);
      } catch (error) {
        logger.warn('[autoSync] check-in write failed — run stopped, watermark held:', error);
        writeFailed = true;
        break;
      }
      writes.push(req);
    }
    if (writeFailed) break;
  }

  if (!writeFailed) {
    // Yesterday, never today: past days are final, today keeps accruing. Never
    // backwards: a re-run under a rewound clock must not reopen scanned days.
    const yesterday = shiftDay(today, -1);
    if (!state.lastSyncedDay || yesterday > state.lastSyncedDay) {
      await saveState({ connectDay, lastSyncedDay: yesterday });
    }
  }

  return { ran: true, reason: null, window, writes, writeFailed };
}

// ─── The catch-up row ───────────────────────────────────────────────────────

/**
 * A write request materialised through the app's REAL check-in path —
 * `buildCheckinRow` with all its boundary validation — never a hand-rolled row.
 * Past days are stamped at that day's local noon (inside the one-year floor and
 * never in the future); today uses the live clock so ordering against manual
 * taps stays natural. Attribution rides the row (`source: 'health'`) and
 * degrades per-column at the push (lib/data/mutations/checkins.ts).
 */
export function buildAutoSyncCheckinRow(params: {
  markId: string;
  userId: string;
  day: string;
  amount: number;
  today: string;
}): MarkEventRow {
  const now =
    params.day === params.today ? getAppDateTime() : new Date(`${params.day}T12:00:00`);
  return buildCheckinRow(
    { markId: params.markId, userId: params.userId, amount: params.amount, source: 'health' },
    now,
  );
}
