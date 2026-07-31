// lib/data/checkins.ts
//
// M9 Phase 1 — READ ONLY. Check-ins are rows in `mark_events`.
//
// We read the EVENTS, never `marks.total`: the stored total becomes derived in
// Phase 4, and reading it here would bake in the very drift this milestone removes.

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, MARK_EVENT_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
import { subscribeOutbox, pendingOutboxEntries } from '@/lib/data/outbox';
import { formatDate } from '@/lib/date';
import { getAppDate } from '@/lib/appDate';
import type { MarkEventRow } from '@/lib/data/types';

// Check-ins change constantly (every tap writes one), so a short stale window keeps
// counts honest while still de-duping bursts of refetches within a few seconds.
const CHECKINS_STALE_TIME = 30 * 1000;

/** Today's local date, computed exactly as the write path stores `occurred_local_date`
 * (`formatDate(getAppDate())` in hooks/useCounters.ts) so reads and writes agree. */
export function todayLocalDate(): string {
  return formatDate(getAppDate());
}

/** All live check-in events for one mark, newest first. */
export async function fetchCheckins(markId: string): Promise<MarkEventRow[]> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .select(selectList(MARK_EVENT_COLUMNS))
    .eq('mark_id', markId)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkEventRow[];
}

/** Every live check-in the user owns, newest first. This is the query-layer
 * equivalent of the old `eventsSlice.events` array — Goals and Focus read it for
 * weekly-completion math and then filter by mark/week in memory, exactly as before.
 * (Phase 4 makes counts derived; this preserves parity in the meantime.) */
export async function fetchUserCheckins(): Promise<MarkEventRow[]> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .select(selectList(MARK_EVENT_COLUMNS))
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkEventRow[];
}

/** Every live check-in the user logged on a given local date (default: today). */
export async function fetchTodayCheckins(localDate: string): Promise<MarkEventRow[]> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .select(selectList(MARK_EVENT_COLUMNS))
    .eq('occurred_local_date', localDate)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkEventRow[];
}

/**
 * The check-ins for one mark AS THE CACHE CURRENTLY HOLDS THEM.
 *
 * M9 Phase 3 Task 2. The post-log side effects — badge progress and goal credit —
 * used to read their event list from `eventsSlice`, the SQLite store. That store no
 * longer receives check-ins, so they read it here instead. The optimistic patch in
 * `useLogCheckinMutation.onMutate` lands BEFORE the effects run, so this returns
 * exactly what the store used to: the just-logged event included.
 *
 * Prefers the per-mark key (complete for that mark by construction) and falls back
 * to filtering the all-events list, because Focus and Goals fetch only the latter.
 */
export function readCachedCheckins(
  client: QueryClient,
  userId: string,
  markId: string,
): MarkEventRow[] {
  const perMark = client.getQueryData<MarkEventRow[]>(queryKeys.checkins(userId, markId));
  if (perMark) return perMark;
  const all = client.getQueryData<MarkEventRow[]>(queryKeys.userCheckins(userId));
  return (all ?? []).filter((e) => e.mark_id === markId);
}

// ─── The outbox read merge (M9 Phase 4 Task 4) ──────────────────────────────
//
// Any check-in read MERGES what the server returned with the entries still
// queued in the outbox, AT READ TIME. This is what makes D-3 true in practice
// rather than only in the celebration animation: the optimistic cache patch is
// transient (a refetch or an app restart discards it), while the outbox is
// durable — so the queued check-in stays on every screen until the flush lands
// it, and the app never contradicts itself while offline.
//
// The merge is a READ concern, never a cache write (R4): writing pending rows
// into the query cache would make the cache authoritative, and the cache may be
// discarded at any time. The pending rows live in the hook's return value only.

/** The signed-in user's queued check-in rows, reactive to outbox changes. */
function usePendingCheckinRows(userId: string): readonly MarkEventRow[] {
  const entries = useSyncExternalStore(subscribeOutbox, pendingOutboxEntries, pendingOutboxEntries);
  return useMemo(
    () =>
      entries
        .filter((e) => e.table === 'mark_events' && e.row.user_id === userId)
        .map((e) => e.row as MarkEventRow),
    [entries, userId],
  );
}

/**
 * PURE. Pending rows overlaid on the server list, deduped by id (a row that has
 * flushed AND been refetched appears once), newest-first by `occurred_at` —
 * exactly the order the fetchers return, so a reader cannot tell a merged list
 * from a fetched one. That indistinguishability is spec guard 3, pinned in
 * offlineReadMerge.test.ts.
 *
 * With nothing pending this returns the server value UNTOUCHED (same reference,
 * including `undefined` while loading) so online behaviour is byte-identical.
 */
export function mergePendingCheckins(
  server: MarkEventRow[] | undefined,
  pending: readonly MarkEventRow[],
): MarkEventRow[] | undefined {
  if (pending.length === 0) return server;
  const pendingIds = new Set(pending.map((r) => r.id));
  const merged = [...pending, ...(server ?? []).filter((r) => !pendingIds.has(r.id))];
  merged.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0));
  return merged;
}

export function useUserCheckins() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const pending = usePendingCheckinRows(userId);
  const query = useQuery({
    queryKey: queryKeys.userCheckins(userId),
    queryFn: fetchUserCheckins,
    enabled: userId !== '',
    staleTime: CHECKINS_STALE_TIME,
  });
  const data = useMemo(() => mergePendingCheckins(query.data, pending), [query.data, pending]);
  return { ...query, data };
}

export function useCheckins(markId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const pending = usePendingCheckinRows(userId);
  const query = useQuery({
    queryKey: queryKeys.checkins(userId, markId),
    queryFn: () => fetchCheckins(markId),
    enabled: userId !== '' && markId !== '',
    staleTime: CHECKINS_STALE_TIME,
  });
  const data = useMemo(
    () =>
      mergePendingCheckins(
        query.data,
        pending.filter((r) => r.mark_id === markId),
      ),
    [query.data, pending, markId],
  );
  return { ...query, data };
}

export function useTodayCheckins() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const localDate = todayLocalDate();
  const pending = usePendingCheckinRows(userId);
  const query = useQuery({
    queryKey: queryKeys.todayCheckins(userId, localDate),
    queryFn: () => fetchTodayCheckins(localDate),
    enabled: userId !== '',
    staleTime: CHECKINS_STALE_TIME,
  });
  const data = useMemo(
    () =>
      mergePendingCheckins(
        query.data,
        pending.filter((r) => r.occurred_local_date === localDate),
      ),
    [query.data, pending, localDate],
  );
  return { ...query, data };
}
