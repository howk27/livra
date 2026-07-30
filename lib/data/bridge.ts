// lib/data/bridge.ts
//
// M9 Phase 2 — TEMPORARY write→read bridge. While both systems are live, a screen
// that READS from a query but WRITES through an old store shows a stale value until
// the query refetches. Store write actions call `bridgeInvalidate(...)` so the
// relevant query keys refetch immediately.
//
// Every call site is marked `// PHASE-2 BRIDGE: delete in Phase 3`. Phase 3 gives
// the data layer real mutations and deletes all of this.
//
// Entity-scoped and user-AGNOSTIC on purpose: keys are `['livra', userId, entity, …]`,
// so matching on `queryKey[2]` invalidates the entity for whoever is signed in
// without threading a user id through store internals.

import { queryClient } from '@/lib/data/queryClient';
import { queryKeys } from '@/lib/data/queryKeys';
import type { MarkEvent } from '@/types';
import type { MarkEventRow } from '@/lib/data/types';

export type BridgeEntity = 'goals' | 'marks' | 'checkins' | 'notes';

export function bridgeInvalidate(...entities: BridgeEntity[]): void {
  if (entities.length === 0) return;
  const wanted = new Set<string>(entities);
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        Array.isArray(key) &&
        key[0] === 'livra' &&
        typeof key[2] === 'string' &&
        wanted.has(key[2] as string)
      );
    },
  });
}

// ─── Check-in cache patch (M9 Phase 2, founder decision 2026-07-29, Option A) ───
//
// Check-ins are the ONE entity where invalidate is the wrong bridge. The write
// lands in SQLite and the query reads from Supabase, so invalidate→refetch would
// hit Supabase BEFORE sync has pushed and return the OLD rows — the count visibly
// reverts, and offline the check-in never appears at all (the spec requires
// offline check-ins to look identical to online ones). Instead we mirror the
// store's optimistic write into the query cache directly. The event carries a
// client-generated id, so when the real row later arrives from Supabase a refetch
// replaces it by id with no duplicate.
//
// Only EXISTING cache entries are patched (`oldData === undefined` → skip): a
// screen that has not fetched yet will include the event on its first fetch, and
// seeding a fresh single-item list would masquerade as a complete list.

/** The store's `MarkEvent` as the query layer's `mark_events` Row. */
function toRow(event: MarkEvent): MarkEventRow {
  return {
    id: event.id,
    user_id: event.user_id,
    mark_id: event.mark_id,
    event_type: event.event_type,
    amount: event.amount,
    occurred_at: event.occurred_at,
    occurred_local_date: event.occurred_local_date,
    meta: (event.meta ?? null) as MarkEventRow['meta'],
    created_at: event.created_at,
    updated_at: event.updated_at,
    deleted_at: event.deleted_at ?? null,
  };
}

/** Prepend `row` newest-first, replacing any existing entry with the same id
 * (idempotent: a real refetch carrying the same id must not double it). */
function upsertRow(existing: MarkEventRow[] | undefined, row: MarkEventRow): MarkEventRow[] | undefined {
  if (existing === undefined) return existing; // patch only what's already cached
  return [row, ...existing.filter((e) => e.id !== row.id)];
}

function removeRow(existing: MarkEventRow[] | undefined, id: string): MarkEventRow[] | undefined {
  if (existing === undefined) return existing;
  return existing.filter((e) => e.id !== id);
}

// PHASE-2 BRIDGE: delete in Phase 3
/** Mirror a freshly-logged check-in into the three check-in caches. */
export function bridgeCheckinAdded(event: MarkEvent): void {
  const row = toRow(event);
  const userId = event.user_id;
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.checkins(userId, event.mark_id),
    (old) => upsertRow(old, row),
  );
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.userCheckins(userId),
    (old) => upsertRow(old, row),
  );
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.todayCheckins(userId, event.occurred_local_date),
    (old) => upsertRow(old, row),
  );
}

// PHASE-2 BRIDGE: delete in Phase 3
/** Drop a check-in from the caches after an undo / soft-delete. */
export function bridgeCheckinRemoved(params: {
  userId: string;
  markId: string;
  eventId: string;
  localDate: string;
}): void {
  const { userId, markId, eventId, localDate } = params;
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.checkins(userId, markId),
    (old) => removeRow(old, eventId),
  );
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.userCheckins(userId),
    (old) => removeRow(old, eventId),
  );
  queryClient.setQueryData<MarkEventRow[]>(
    queryKeys.todayCheckins(userId, localDate),
    (old) => removeRow(old, eventId),
  );
}
