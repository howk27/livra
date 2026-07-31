// lib/data/bridge.ts
//
// M9 — the LAST REMNANT of the Phase 2 write→read bridge.
//
// Phase 2 needed this because a screen READ from a query but WROTE through an old
// store: the write landed in SQLite, the read came from Supabase, and without a
// nudge the screen showed a stale value. Phase 3 replaced every one of those
// writes with a real mutation that reaches Supabase and owns its own cache, so
// the bridge is gone — except here.
//
// WHAT IS LEFT, AND WHY. `goalsSlice.linkMarkToGoal` / `unlinkMarkFromGoal` still
// have four callers on surfaces this task did not migrate: `app/goal/new.tsx`,
// `app/mark/new.tsx`, `app/onboarding.tsx` and `lib/goals/createFromAIPackage.ts`
// (plus a defensive call in the dead increment path of `hooks/useCounters.ts`).
// Those write links to SQLite, so the migrated screens still need the nudge.
//
// ⚠️ THE NUDGE IS KNOWN-WEAK, and it is why this is temporary rather than a
// design. Invalidate→refetch reads Supabase, which does not have the row until
// sync pushes it — the same reason invalidate was wrong for check-ins and goal
// notes. It helps when sync has already pushed and does nothing when it has not.
// The fix is to migrate those four callers, NOT to make this cleverer.
//
// Entity-scoped and user-AGNOSTIC on purpose: keys are `['livra', userId, entity,
// …]`, so matching on `queryKey[2]` invalidates the entity for whoever is signed
// in without threading a user id through store internals.

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
