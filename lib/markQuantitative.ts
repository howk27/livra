/**
 * Quantitative marks — the rare exception to binary once-a-day logging.
 *
 * Livra's default is binary: a mark is a single daily check ("did I do it?"),
 * and every log surface locks after one tap for the day (dailyTarget = 1). The
 * value is the unbroken chain, not a running count — that keeps the app calm.
 *
 * A *quantitative* mark is one where the number is intrinsic to the activity, so
 * tapping up toward a daily target is meaningful. Water is the only one: you
 * drink glasses toward a daily goal. Deliberately NOT quantitative:
 *   - steps    — a HealthKit / daily-target hit, not a button you tap N times
 *   - calories — a "stay inside the range today" adherence check (yes/no)
 * Both of those are daily hits, i.e. binary.
 */

/** Library ids whose daily log accumulates toward a target instead of a single check. */
export const QUANTITATIVE_MARK_IDS: ReadonlySet<string> = new Set(['water']);

/** The daily target a newly created quantitative mark should start with. */
const QUANTITATIVE_DEFAULT_TARGET: Record<string, number> = {
  water: 8,
};

export function isQuantitativeMarkId(libraryId: string | null | undefined): boolean {
  return !!libraryId && QUANTITATIVE_MARK_IDS.has(libraryId);
}

/**
 * The `dailyTarget` a mark created from the given library id should get:
 * the quantitative default (e.g. water → 8), or 1 for a binary mark, where a
 * single tap completes the day and every surface then locks.
 */
export function defaultDailyTargetForMarkId(libraryId: string | null | undefined): number {
  if (libraryId && QUANTITATIVE_DEFAULT_TARGET[libraryId] > 0) {
    return QUANTITATIVE_DEFAULT_TARGET[libraryId];
  }
  return 1;
}
