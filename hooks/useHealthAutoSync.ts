// hooks/useHealthAutoSync.ts
//
// Health auto-sync TRIGGER (health-auto-sync T4, spec §2.2): app launch and
// AppState background→active, debounced to at most one ENGINE PASS per 15
// minutes. The engine (lib/health/autoSync.ts, T3) decides what to write; this
// hook is the caller's half of the contract — it answers the gates FRESH ON
// EVERY RUN (signed-in · Pro · Health connected · master toggle), wires the
// cache reads the engine needs, and executes writes through the app's real
// check-in path (`buildAutoSyncCheckinRow` → `useLogCheckinMutation`).
//
// GATES ARE PER-RUN, NEVER CACHED (spec §6.6): `checkProStatus()` is awaited
// inside every attempt, so a Pro expiry mid-lifecycle stops the next run with
// zero HealthKit reads and zero writes — and the bindings map is never touched,
// because the engine returns before reading it.
//
// VOICE (spec §2.7): the engine marks each write `quiet`. A quiet (catch-up)
// write lands credit only — goal credit and badge progress reconcile, nothing
// speaks. Today's write (quiet: false) runs the SAME post-log chain a manual
// tap runs in hooks/useCheckin.ts — voice line, MARK_LOGGED, badges, goal
// credit. That block deliberately MIRRORS useCheckin's (which this task may not
// edit); if the manual chain grows a step, add it here too.
//
// DEBOUNCE STAMPS ON REAL RUNS ONLY: a gate-refused attempt does no HealthKit
// work, so it does not burn the window — the first foreground after a Pro
// purchase or a Settings toggle-on syncs immediately.

import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  runAutoSync,
  buildAutoSyncCheckinRow,
  type AutoSyncRunResult,
  type RunAutoSyncOptions,
} from '../lib/health/autoSync';
import { allHealthKitBindings } from '../lib/health/healthKitBinding';
import { readAutoSyncEnabled } from '../lib/health/autoSyncSettings';
import { useLogCheckinMutation } from '../lib/data/mutations/checkins';
import { readCachedCheckins } from '../lib/data/checkins';
import { queryKeys } from '../lib/data/queryKeys';
import { creditMarkToGoals } from '../lib/goals/goalLifecycle';
import { readGoalDataSnapshot } from '../lib/goals/momentumEvaluation';
import { toGoal, toMark } from '../lib/data/adapters';
import { totalsByMark } from '../lib/data/derived';
import { resolveDailyTarget } from '../lib/markDailyTarget';
import { checkProStatus } from '../lib/iap/iap';
import { useUIStore } from '../state/uiSlice';
import { useVoiceStore } from '../state/voiceSlice';
import { maybeShowPostLogVoice } from '../lib/moments/postLogVoice';
import { resolveFirstName } from '../lib/profile/displayName';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { formatDate, daysBetween } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { logger } from '../lib/utils/logger';
import { useAuth } from './useAuth';
import { useBadges } from './useBadges';
import type { MarkEvent } from '../types';
import type { MarkEventRow, MarkRow } from '../lib/data/types';

/** Spec §2.2: at most one engine pass per 15 minutes. */
export const AUTO_SYNC_DEBOUNCE_MS = 15 * 60 * 1000;

/** Module-level on purpose: the debounce must survive remounts within one JS
 * lifetime (a relaunch IS the launch trigger and rightly starts fresh). */
let lastRunAt: number | null = null;
let runInFlight = false;

export function __resetHealthAutoSyncForTests(): void {
  lastRunAt = null;
  runInFlight = false;
}

/** Query row → domain shape the post-log effect helpers take. Local copy, the
 * strangler-seam convention (hooks/useCheckin.ts carries the same adapter). */
function toMarkEvent(row: MarkEventRow): MarkEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.mark_id,
    event_type: row.event_type as MarkEvent['event_type'],
    amount: row.amount ?? 1,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

/** Mirrors hooks/useCheckin.ts `lastActivityBefore`: most recent logged day
 * strictly before `today`, feeding MARK_LOGGED's `gap_days`. */
function lastActivityBefore(rows: readonly MarkEventRow[], today: string): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.event_type !== 'increment' || row.deleted_at) continue;
    if (row.occurred_local_date >= today) continue;
    if (latest === null || row.occurred_local_date > latest) latest = row.occurred_local_date;
  }
  return latest;
}

export interface HealthAutoSyncContext {
  userId: string | undefined;
  client: QueryClient;
  /** The app's real check-in write path: `useLogCheckinMutation().mutateAsync`
   * (optimistic cache patch, offline outbox, per-column degrade — all of it). */
  logRow: (row: MarkEventRow) => Promise<unknown>;
  /** Badge reconciliation: `useBadges().evaluateMarkBadges`. */
  evaluateMarkBadges: (
    markId: string,
    userId: string,
    events: readonly MarkEvent[],
  ) => Promise<unknown>;
  /** For the post-log voice line (resolveFirstName at the hook). */
  firstName: string | null;
  /** Test seams. */
  now?: () => number;
  today?: string;
  readers?: RunAutoSyncOptions['readers'];
}

/**
 * One trigger attempt: debounce → gates (fresh) → engine pass → post-write
 * effects. Returns null when debounced, in flight, or signed out; otherwise the
 * engine's result. Never throws — a failed sync must never mark a foreground.
 */
export async function attemptHealthAutoSync(
  ctx: HealthAutoSyncContext,
): Promise<AutoSyncRunResult | null> {
  const { userId, client } = ctx;
  if (runInFlight || !userId) return null;
  const nowMs = (ctx.now ?? Date.now)();
  if (lastRunAt !== null && nowMs - lastRunAt < AUTO_SYNC_DEBOUNCE_MS) return null;

  runInFlight = true;
  try {
    // Gates, answered fresh for THIS run (spec §6.6). The engine re-checks the
    // same object; wiring them here keeps the refusal visible at the call site.
    const [proStatus, autoSyncEnabled, bindings] = await Promise.all([
      checkProStatus(),
      readAutoSyncEnabled(),
      allHealthKitBindings(),
    ]);
    const gates = {
      isPro: proStatus.effectiveUnlocked,
      healthConnected: useUIStore.getState().healthConnected,
      autoSyncEnabled,
    };

    const today = ctx.today ?? formatDate(getAppDate());
    const result = await runAutoSync({
      userId,
      gates,
      bindings,
      loggedAmount: (markId, day) =>
        readCachedCheckins(client, userId, markId)
          .filter(
            (r) =>
              r.event_type === 'increment' && !r.deleted_at && r.occurred_local_date === day,
          )
          .reduce((sum, r) => sum + (r.amount ?? 1), 0),
      dailyTarget: (markId) => {
        const rows = client.getQueryData<MarkRow[]>(queryKeys.marks(userId));
        const row = rows?.find((r) => r.id === markId);
        return row ? resolveDailyTarget(row) : 1;
      },
      writeCheckin: async (req) => {
        const row = buildAutoSyncCheckinRow({
          markId: req.markId,
          userId,
          day: req.day,
          amount: req.amount,
          today,
        });
        await ctx.logRow(row);
      },
      today,
      readers: ctx.readers,
    });

    if (result.ran) {
      // Only a real engine pass burns the window — see header note.
      lastRunAt = nowMs;
      await runPostWriteEffects(ctx, result, today);
    }
    return result;
  } catch (error) {
    logger.warn('[healthAutoSync] trigger attempt failed:', error);
    return null;
  } finally {
    runInFlight = false;
  }
}

/**
 * The after-write chain. Quiet writes: credit + badge reconciliation only.
 * The (at most one per mark) speaking write additionally runs the voice line
 * and MARK_LOGGED — the manual tap's chain in hooks/useCheckin.ts, mirrored.
 */
async function runPostWriteEffects(
  ctx: HealthAutoSyncContext,
  result: AutoSyncRunResult,
  today: string,
): Promise<void> {
  const { client } = ctx;
  const userId = ctx.userId as string; // guarded by the caller
  if (result.writes.length === 0) return;

  for (const write of result.writes.filter((w) => !w.quiet)) {
    try {
      const markRows = readCachedCheckins(client, userId, write.markId);
      const previousActivity = lastActivityBefore(markRows, today);

      // Mirrors useCheckin's voiceData block: first holder goal via live links.
      const snapshot = readGoalDataSnapshot(client, userId);
      const totals = totalsByMark(snapshot.events);
      const holderByMark = new Map<string, string>();
      for (const [goalId, list] of Object.entries(snapshot.marksByGoal)) {
        for (const m of list) if (!holderByMark.has(m.id)) holderByMark.set(m.id, goalId);
      }
      const voiceData = {
        marks: snapshot.marks.map((row) => ({
          ...toMark(row, totals),
          goal_id: holderByMark.get(row.id) ?? null,
        })),
        events: snapshot.events.map(toMarkEvent),
        goals: snapshot.goals.map((g) =>
          toGoal(g, (snapshot.marksByGoal[g.id] ?? []).map((m) => m.id)),
        ),
      };

      let voiceLineShown = false;
      try {
        voiceLineShown = maybeShowPostLogVoice(
          write.markId,
          today,
          ctx.firstName,
          voiceData,
          useVoiceStore.getState().evaluatePostLog,
        );
      } catch (error) {
        logger.error('[healthAutoSync] post-log voice failed', error);
      }

      capture(ANALYTICS_EVENTS.MARK_LOGGED, {
        mark_id: write.markId,
        gap_days: previousActivity ? daysBetween(previousActivity, today) : null,
        voice_line_shown: voiceLineShown,
        // Extra vs the manual event, so funnels can split auto from manual.
        source: 'health',
      });
    } catch (error) {
      logger.error('[healthAutoSync] speaking-write effects failed', error);
    }
  }

  // Credit lands for EVERY written mark, quiet or not (spec §2.7): badge
  // progress and goal credit are derived state, not celebration.
  const writtenMarkIds = [...new Set(result.writes.map((w) => w.markId))];
  for (const markId of writtenMarkIds) {
    const events = readCachedCheckins(client, userId, markId).map(toMarkEvent);
    ctx.evaluateMarkBadges(markId, userId, events).catch((error) => {
      logger.error('[healthAutoSync] badge evaluation failed', error);
    });
    try {
      await creditMarkToGoals(client, userId, markId, events).then(() =>
        import('../services/momentumWarningNotifications').then(
          ({ reconcileMomentumWarnings }) => reconcileMomentumWarnings(userId),
        ),
      );
    } catch (error) {
      logger.error('[healthAutoSync] goal credit failed', error);
    }
  }
}

/**
 * Mount point (app/_layout.tsx, inside PersistQueryClientProvider — this uses
 * React Query hooks). Launch + foreground triggers around `attemptHealthAutoSync`,
 * the `useDayRollover` signal family.
 */
export function useHealthAutoSync(): void {
  const { user } = useAuth();
  const userId = user?.id;
  const client = useQueryClient();
  const logMutation = useLogCheckinMutation();
  const { evaluateMarkBadges } = useBadges(userId);
  const firstName = resolveFirstName(user?.user_metadata, user?.email);

  // Refs so the trigger effect keys off userId alone: mutation/badge identities
  // churn with their own state and must not re-arm the listeners mid-run.
  const logRowRef = useRef(logMutation.mutateAsync);
  logRowRef.current = logMutation.mutateAsync;
  const badgesRef = useRef(evaluateMarkBadges);
  badgesRef.current = evaluateMarkBadges;
  const firstNameRef = useRef(firstName);
  firstNameRef.current = firstName;

  const attempt = useCallback(() => {
    void attemptHealthAutoSync({
      userId,
      client,
      logRow: (row) => logRowRef.current(row),
      evaluateMarkBadges: (markId, uid, events) => badgesRef.current(markId, uid, events),
      firstName: firstNameRef.current,
    });
  }, [userId, client]);

  useEffect(() => {
    // Launch (and sign-in, when userId arrives — a signed-out attempt is free).
    attempt();
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') attempt();
    });
    return () => subscription.remove();
  }, [attempt]);
}
