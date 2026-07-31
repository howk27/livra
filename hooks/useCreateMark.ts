// hooks/useCreateMark.ts
//
// M9 Phase 3 Task 6 — the app-layer replacement for `useCounters().createMark`.
//
// The write itself is one INSERT (plus its link) through
// `lib/data/mutations/marks.ts`. What lives HERE is everything the old hook did
// around that write: the duplicate-name check, the Pro-status gate, the free-tier
// pre-checks, and badge initialisation — app orchestration, kept out of `lib/data/`
// for the same reason `useCheckin` and `useCompleteGoal` keep XP and analytics out.
//
// THE PRE-CHECKS ARE UX, NOT ENFORCEMENT. The RESTRICTIVE RLS policy on
// `public.marks` is the enforcement; these checks exist so a free user meets a
// worded wall instead of a refused request. Two of them changed source with the
// migration, deliberately:
//   • duplicates and the account ceiling now count the QUERY-LAYER marks
//     (`fetchMarksForUser`) instead of the SQLite store — the store no longer sees
//     a mutation-created mark until sync pulls it, so counting it would miss every
//     mark created since the last pull;
//   • the per-goal cap counts live LINKS (`fetchMarksByGoal`), not `marks.goal_id`
//     — new marks never carry `goal_id` (T6), so the old count decays toward zero.
//     This keeps the product's 4-per-goal wall standing client-side while the
//     server cap is link-blind; Phase 5 moves the RLS cap onto `goal_mark_links`
//     and the two sides meet again.

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateMarkMutation, type MarkCadence } from '../lib/data/mutations/marks';
import { fetchMarksForUser, fetchMarksByGoal } from '../lib/data/marks';
import { queryKeys } from '../lib/data/queryKeys';
import { DuplicateMarkError } from '../lib/errors';
import { useBadges } from './useBadges';
import { useIapSubscriptions } from './useIapSubscriptions';
import {
  canAddMark,
  canAddMarkToGoal,
  countActiveMarks,
} from '../lib/gating';
import { MARK_PER_GOAL_LIMIT_MESSAGE, MARK_CEILING_MESSAGE } from '../lib/copy';
import { logger } from '../lib/utils/logger';
import type { MarkRow } from '../lib/data/types';

export interface CreateMarkArgs {
  name: string;
  emoji: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
  enableStreak: boolean;
  /** Link the new mark to this goal (a LINK is written, never `goal_id`). */
  goalId: string | null;
  cadence: MarkCadence;
}

export interface CreateMarkGate {
  name: string;
  goalId: string | null;
  /** Every live mark on the account (query layer). */
  marks: readonly Pick<MarkRow, 'name' | 'deleted_at'>[];
  /** Live linked-mark count for `goalId`, from `goal_mark_links`. */
  marksInGoalCount: number;
  isProUnlocked: boolean;
  proStatus: { verification: string; status: string };
}

/**
 * The pre-flight checks, pure so they are testable without React or a network.
 * Throws the SAME error shapes `useCounters.createMark` threw — mark/new's
 * `handleCreateMarkError` branches on them and did not have to change.
 */
export function assertCanCreateMark(gate: CreateMarkGate): void {
  const name = gate.name.trim().toLowerCase();
  const duplicate = gate.marks.find(
    (m) => !m.deleted_at && m.name.toLowerCase() === name,
  );
  if (duplicate) throw new DuplicateMarkError(gate.name.trim());

  if (gate.isProUnlocked) return;

  if (gate.proStatus.verification === 'unverified' && gate.proStatus.status === 'unknown') {
    throw new Error('PRO_STATUS_UNKNOWN: Unable to verify subscription. Please try again.');
  }
  if (gate.goalId && !canAddMarkToGoal(false, gate.marksInGoalCount)) {
    throw new Error(`FREE_COUNTER_LIMIT_REACHED: ${MARK_PER_GOAL_LIMIT_MESSAGE}`);
  }
  if (!canAddMark(false, countActiveMarks(gate.marks))) {
    throw new Error(`FREE_COUNTER_LIMIT_REACHED: ${MARK_CEILING_MESSAGE}`);
  }
}

export function useCreateMark(userId: string) {
  const client = useQueryClient();
  const mutation = useCreateMarkMutation();
  const { isProUnlocked, proStatus } = useIapSubscriptions();
  const { evaluateMarkBadges } = useBadges(userId);

  const createMark = useCallback(
    async (args: CreateMarkArgs): Promise<MarkRow> => {
      // Cached when fresh, fetched when not — a create is a button tap with a
      // loading state, so one read here is invisible and keeps the checks honest.
      const marks = await client.ensureQueryData({
        queryKey: queryKeys.marks(userId),
        queryFn: fetchMarksForUser,
      });

      let marksInGoalCount = 0;
      if (args.goalId && !isProUnlocked) {
        const byGoal = await client.ensureQueryData({
          queryKey: queryKeys.marksByGoal(userId),
          queryFn: fetchMarksByGoal,
        });
        marksInGoalCount = (byGoal[args.goalId] ?? []).length;
      }

      assertCanCreateMark({
        name: args.name,
        goalId: args.goalId,
        marks,
        marksInGoalCount,
        isProUnlocked,
        proStatus,
      });

      const row = await mutation.mutateAsync({
        userId,
        name: args.name,
        emoji: args.emoji,
        color: args.color,
        unit: args.unit,
        enableStreak: args.enableStreak,
        sortIndex: marks.length,
        cadence: args.cadence,
        goalId: args.goalId,
      });

      evaluateMarkBadges(row.id, userId).catch((error: unknown) => {
        logger.error('[createMark] badge initialisation failed', error);
      });

      return row;
    },
    [client, userId, mutation, isProUnlocked, proStatus, evaluateMarkBadges],
  );

  return { createMark, isCreating: mutation.isPending };
}
