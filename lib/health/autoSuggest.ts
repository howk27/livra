import { resolveLibraryMark, type MarkCategoryInput } from '../markCategoryResolve';
import type { HealthKitType } from './healthTypes';

/**
 * Which HealthKit type may log this mark automatically — or null, meaning the
 * mark is not health-able and no Health surface (banner, connect, auto-bind)
 * should be offered for it.
 *
 * Founder 2026-08-06: the answer comes from MARK_LIBRARY.healthKitType and
 * nowhere else. This module used to be a name regex claiming 6 types
 * ("Vitality" → hydration, "Recovery" → sleep), while the library's curated
 * column said 3 (Sleep, Workout, Steps). Two disagreeing sources meant the
 * banner showed on every mark and auto-bind trusted fuzzy matches; the honest
 * set won, at the cost of coverage. Matching is resolveLibraryMark's
 * name-first / emoji-fallback — the same key every other library-derived
 * surface (icon, accent, definition) uses, so a custom mark resolves to null
 * here exactly when it gets no library face either.
 */
export function resolveHealthKitType(mark: MarkCategoryInput): HealthKitType | null {
  return resolveLibraryMark(mark)?.healthKitType ?? null;
}
