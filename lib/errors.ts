// lib/errors.ts
//
// App-layer error CLASSES — the vocabulary of the create/complete gates.
// Callers branch on these with `instanceof` (mark/new.tsx, useSuggestGoalFlow),
// so each class must have exactly ONE definition in the app. They moved here in
// M9 Phase 5A Task 6 because their old homes (state/goalsSlice.ts,
// state/countersSlice.ts) are retired; the gates that throw them
// (hooks/useCreateMark.ts, lib/goals/createFromAIPackage.ts) survive.
//
// Distinct from `lib/data/errors.ts`, which is the data layer's typed
// DataError union for raw Postgres/PostgREST failures. These classes are the
// UX wall a user meets BEFORE a request is sent.

export class GoalLimitError extends Error {
  constructor() {
    super('Free keeps you to 2 goals at once. Finish one or upgrade to Livra+ for unlimited goals.');
    this.name = 'GoalLimitError';
  }
}

export class DuplicateMarkError extends Error {
  constructor(public markName: string) {
    super(`A mark with the name "${markName}" already exists`);
    this.name = 'DuplicateMarkError';
  }
}

// Legacy alias from the counters era. Old catch sites test for BOTH classes;
// class extension keeps `instanceof DuplicateMarkError` true for either.
export class DuplicateCounterError extends DuplicateMarkError {
  constructor(public counterName: string) {
    super(counterName);
    this.name = 'DuplicateCounterError';
    // Also set markName for compatibility
    (this as any).markName = counterName;
  }
}
