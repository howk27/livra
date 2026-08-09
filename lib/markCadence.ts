// Cadence resolution for rows that never got one.
//
// THE MEASUREMENT (live, 2026-08-08): 8 of 40 active marks carry NULL
// weekly_target AND NULL frequency_kind. Every one of them was created on or
// before 2026-07-21; all 23 marks created since carry cadence, because all four
// creation paths now write it (app/goal/new.tsx, app/mark/new.tsx twice,
// lib/goals/createFromAIPackage.ts). So the SOURCE is closed.
//
// It is closed for NEW installs. It is not closed for old ones: builds 61-63 are
// still in the wild and an old client can still sync up a cadence-less mark. A
// one-time backfill would have left that door open, which is why this is a
// resolution rule in code rather than an UPDATE against user data.
//
// WITHOUT this, `weekly_target ?? 3` in features.ts / focusQueue.ts /
// consistency.ts silently invents a 3x-per-week cadence nobody chose — and the
// goal-screen bar and the Focus strikethrough both draw against that invented
// number. A Steps mark the library calls 7x/week reads "done for the week"
// after three logs.
//
// It resolves through `resolveLibraryMark`, the resolver the app already uses
// for icons and accents: NAME first, EMOJI as the fallback. The emoji leg is
// what covers AI-authored names — verified against live data, where
// "Attend gym sessions" carries the Workout emoji and "Track daily step count"
// carries the Steps emoji. No hand-written name mapping exists here on purpose:
// a table of specific user strings would go stale the moment the model phrases
// something differently.

import { resolveLibraryMark } from './markCategoryResolve';
import type { FrequencyKind } from '../types/index';

/**
 * The cadence quintet as it lives ON A ROW — any of them possibly absent, and
 * `frequency_kind` typed as the bare `string` the column actually is. There is
 * no CHECK constraint behind it, so a row can carry a value that is not a
 * FrequencyKind at all; the call sites this replaces papered over that with an
 * unchecked `as FrequencyKind` cast.
 */
export interface RowCadence {
  frequency_min: number | null;
  frequency_recommended: number | null;
  frequency_max: number | null;
  weekly_target: number | null;
  frequency_kind: string | null;
}

/** The same quintet after resolution — `frequency_kind` now proven. */
export interface ResolvedCadence extends RowCadence {
  frequency_kind: FrequencyKind | null;
}

const FREQUENCY_KINDS: readonly FrequencyKind[] = ['variable', 'fixed', 'abstinence'];

/** A stored kind is only believed when it is one of the three real ones. An
 *  unrecognised string resolves as absent, so the library fills it instead of
 *  it flowing on as a lie the type system had been told to accept. */
function asFrequencyKind(value: string | null): FrequencyKind | null {
  return value != null && (FREQUENCY_KINDS as readonly string[]).includes(value)
    ? (value as FrequencyKind)
    : null;
}

/** What the resolver needs to find the library entry behind a row. */
export interface CadenceIdentity {
  name: string;
  emoji?: string | null;
}

/**
 * The last-resort weekly target, unchanged from the `?? 3` it replaces. Only
 * reached by a mark that matches NO library entry by name or emoji — i.e. a
 * genuinely custom mark created before custom marks stored their own cadence.
 */
export const CADENCE_FALLBACK_WEEKLY_TARGET = 3;

/**
 * Fill absent cadence fields from the mark's library entry.
 *
 * Stored values ALWAYS win, field by field. This never overwrites a cadence the
 * user (or the Pace toggle) chose — including a stored value that disagrees
 * with the library, which is exactly what a Pace change looks like. It only
 * fills nulls.
 *
 * Filling the whole quintet rather than `weekly_target` alone is deliberate:
 * `paceWeeklyTarget` needs min/recommended/max to move a mark at all, so a mark
 * resolved to a bare target would still be invisible to the Pace control.
 */
export function resolveRowCadence(identity: CadenceIdentity, row: RowCadence): ResolvedCadence {
  const kind = asFrequencyKind(row.frequency_kind);
  const hasAll =
    row.weekly_target != null &&
    kind != null &&
    row.frequency_min != null &&
    row.frequency_recommended != null &&
    row.frequency_max != null;
  if (hasAll) return { ...row, frequency_kind: kind };

  const def = resolveLibraryMark(identity);
  if (!def) {
    return {
      ...row,
      frequency_kind: kind,
      weekly_target: row.weekly_target ?? CADENCE_FALLBACK_WEEKLY_TARGET,
    };
  }

  return {
    frequency_min: row.frequency_min ?? def.frequency_min,
    frequency_recommended: row.frequency_recommended ?? def.frequency_recommended,
    frequency_max: row.frequency_max ?? def.frequency_max,
    // `frequency_recommended` is the steady-pace position — the same value
    // frequencyWeeklyTarget writes at creation, so a resolved mark and a
    // freshly created one of the same kind agree.
    weekly_target: row.weekly_target ?? def.frequency_recommended,
    frequency_kind: kind ?? def.frequencyKind,
  };
}
