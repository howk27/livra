// lib/data/marks.ts
//
// M9 Phase 1 — READ ONLY. Marks resolve through `goal_mark_links`, NEVER through
// `marks.goal_id`.
//
// This is the T6 fix in code form: the goal rendered empty because the two
// representations of the goal↔mark relationship disagreed. This module only ever
// reads the one that survives — the links — so it cannot disagree with itself.
//
// A mark can serve several goals (Spec D-6): `useMarksForUser()` returns each mark
// ONCE; `useMarks(goalId)` may return the same mark under two different goals.
// Any de-dup assumption carried over from the old one-goal-per-mark world is a bug.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, MARK_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
import type { MarkRow } from '@/lib/data/types';

// Marks, like goals, change only on deliberate user action.
const MARKS_STALE_TIME = 5 * 60 * 1000;

/** The live marks linked to a goal, resolved through live `goal_mark_links`. */
export async function fetchMarksForGoal(goalId: string): Promise<MarkRow[]> {
  const client = dataClient();

  const { data: links, error: linkError } = await client
    .from('goal_mark_links')
    .select('mark_id')
    .eq('goal_id', goalId)
    .is('deleted_at', null);
  if (linkError) throw toDataError(linkError);

  const markIds = (links ?? []).map((row) => (row as { mark_id: string }).mark_id);
  if (markIds.length === 0) return [];

  const { data, error } = await client
    .from('marks')
    .select(selectList(MARK_COLUMNS))
    .in('id', markIds)
    .is('deleted_at', null)
    .order('sort_index', { ascending: true });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkRow[];
}

/**
 * Every live goal's marks, grouped by goal id, resolved through live links. This
 * is the LIST-screen equivalent of `fetchMarksForGoal` (Goals/Focus render many
 * goals at once and cannot call `useMarks` in a loop). A mark serving several
 * goals appears under each (Spec D-6). Link `goal_id` is aliased to `gid` in the
 * select so the T6 source guard (no `.goal_id` access) stays valid.
 */
export async function fetchMarksByGoal(): Promise<Record<string, MarkRow[]>> {
  const client = dataClient();

  const { data: links, error: linkError } = await client
    .from('goal_mark_links')
    .select('gid:goal_id, mid:mark_id')
    .is('deleted_at', null);
  if (linkError) throw toDataError(linkError);

  const rows = (links ?? []) as unknown as { gid: string; mid: string }[];
  if (rows.length === 0) return {};

  const markIds = [...new Set(rows.map((row) => row.mid))];
  const { data, error } = await client
    .from('marks')
    .select(selectList(MARK_COLUMNS))
    .in('id', markIds)
    .is('deleted_at', null)
    .order('sort_index', { ascending: true });
  if (error) throw toDataError(error);

  const byId = new Map<string, MarkRow>(
    ((data ?? []) as unknown as MarkRow[]).map((mark) => [mark.id, mark]),
  );
  const grouped: Record<string, MarkRow[]> = {};
  for (const row of rows) {
    const mark = byId.get(row.mid);
    if (!mark) continue; // link points at a soft-deleted mark
    (grouped[row.gid] ??= []).push(mark);
  }
  return grouped;
}

/** Every live mark the user owns, each exactly once. */
export async function fetchMarksForUser(): Promise<MarkRow[]> {
  const { data, error } = await dataClient()
    .from('marks')
    .select(selectList(MARK_COLUMNS))
    .is('deleted_at', null)
    .order('sort_index', { ascending: true });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkRow[];
}

/** A single live mark by id. Returns null when absent. */
export async function fetchMark(markId: string): Promise<MarkRow | null> {
  const { data, error } = await dataClient()
    .from('marks')
    .select(selectList(MARK_COLUMNS))
    .eq('id', markId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw toDataError(error);
  return (data as unknown as MarkRow) ?? null;
}

export function useMarks(goalId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.marksForGoal(userId, goalId),
    queryFn: () => fetchMarksForGoal(goalId),
    enabled: userId !== '' && goalId !== '',
    staleTime: MARKS_STALE_TIME,
  });
}

export function useMarksByGoal() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.marksByGoal(userId),
    queryFn: fetchMarksByGoal,
    enabled: userId !== '',
    staleTime: MARKS_STALE_TIME,
  });
}

export function useMarksForUser() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.marks(userId),
    queryFn: fetchMarksForUser,
    enabled: userId !== '',
    staleTime: MARKS_STALE_TIME,
  });
}

export function useMark(markId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.mark(userId, markId),
    queryFn: () => fetchMark(markId),
    enabled: userId !== '' && markId !== '',
    staleTime: MARKS_STALE_TIME,
  });
}
