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
