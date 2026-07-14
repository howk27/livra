// M4 (PL-5): firstRun vs returnedEmpty derivation + the copy accessor for
// empty surfaces. Pure — no React, no stores, no I/O. The rule (spec §3 M4):
// a user who deleted everything gets different copy than a brand-new user.
// firstRun = no non-deleted entities AND no historical trace for that
// surface's entity type; anything left behind (soft-deleted rows, events,
// non-active goals) means the user has been here before.
import { fillTemplate, pickTemplate } from './content';
import type { EmptySurface, EmptyVariant } from './types';

// Structural shapes only — callers pass store rows; we read three fields.
type MarkLike = { id: string; goal_id?: string | null; deleted_at?: string | null };
type EventLike = { mark_id: string };
type GoalLike = { status: string };

/** Goals adds a third state: every goal finished (kept from the pre-PL-5 screen). */
export type GoalsEmptyKind = EmptyVariant | 'completedAll';

/** The core rule. Callers only invoke this when the surface is already empty,
 *  so any surviving trace of past entities or activity means returnedEmpty. */
export function deriveEmptyVariant(input: {
  everHadEntities: boolean;
  everHadActivity: boolean;
}): EmptyVariant {
  return input.everHadEntities || input.everHadActivity ? 'returnedEmpty' : 'firstRun';
}

/** Focus (entity = marks): soft-deleted marks or any log event are the trace.
 *  Pass ALL marks (deleted included) and ALL events (deleted included — a
 *  deleted log is still evidence the user once logged). */
export function deriveFocusEmptyVariant(
  allMarks: readonly MarkLike[],
  allEvents: readonly EventLike[],
): EmptyVariant {
  return deriveEmptyVariant({
    everHadEntities: allMarks.some((m) => m.deleted_at != null),
    everHadActivity: allEvents.length > 0,
  });
}

/** Goals (entity = goals): deleted goals leave the store entirely, so the trace
 *  is surviving non-active goals (completed/expired/paused) or any mark that
 *  ever pointed at a goal (soft-deleted marks keep their goal_id). */
export function deriveGoalsEmptyVariant(
  allGoals: readonly GoalLike[],
  allMarks: readonly MarkLike[],
): EmptyVariant {
  return deriveEmptyVariant({
    everHadEntities: allGoals.some((g) => g.status !== 'active'),
    everHadActivity: allMarks.some((m) => m.goal_id != null),
  });
}

/** Goals screen kind: finished-everything outranks the generic returnedEmpty —
 *  "you finished everything" is the truer sentence when it applies. */
export function deriveGoalsEmptyKind(
  allGoals: readonly GoalLike[],
  allMarks: readonly MarkLike[],
): GoalsEmptyKind {
  if (allGoals.some((g) => g.status === 'completed')) return 'completedAll';
  return deriveGoalsEmptyVariant(allGoals, allMarks);
}

/** Goal detail (entity = this goal's marks): soft-deleted marks on THIS goal,
 *  or events on any of this goal's marks. Other goals' history does not count. */
export function deriveGoalDetailEmptyVariant(
  goalId: string,
  allMarks: readonly MarkLike[],
  allEvents: readonly EventLike[],
): EmptyVariant {
  const goalMarks = allMarks.filter((m) => m.goal_id === goalId);
  const ids = new Set(goalMarks.map((m) => m.id));
  return deriveEmptyVariant({
    everHadEntities: goalMarks.some((m) => m.deleted_at != null),
    everHadActivity: allEvents.some((e) => ids.has(e.mark_id)),
  });
}

export type EmptyStateCopy = {
  /** Present only on two-line surfaces (goals). */
  title?: string;
  body: string;
};

const STATIC = () => 0; // pools hold one line each; emptiness does not rotate

function resolve(variant: string): string | undefined {
  const picked = pickTemplate('emptyInvitation', variant, null, STATIC);
  return picked ? fillTemplate(picked.template, {}) : undefined;
}

/**
 * The screen-facing accessor: registry copy for an empty surface + variant.
 * Surfaces that cannot distinguish (history, markDetail — inherently firstRun)
 * fall back to their single variant whatever the caller derived.
 */
export function getEmptyStateCopy(
  surface: EmptySurface,
  variant: GoalsEmptyKind = 'firstRun',
): EmptyStateCopy {
  const title = resolve(`${surface}.${variant}.title`);
  const body =
    resolve(`${surface}.${variant}.body`) ??
    resolve(`${surface}.${variant}`) ??
    resolve(`${surface}.firstRun.body`) ??
    resolve(`${surface}.firstRun`) ??
    '';
  return title !== undefined ? { title, body } : { body };
}
