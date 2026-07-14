// lib/markCategoryResolve.ts
// Shared CATEGORY_MAP-key resolution for mark icon tiles (Focus, goal detail).
// The app's own icons, never raw emoji in UI chrome (QC 2026-07-12).
// Single source of truth — extracted from app/(tabs)/focus.tsx and
// app/goal/[id].tsx (VD-4 retry #1, fallow duplication gate).

import { MARK_LIBRARY } from './suggestedCounters';
import { resolveCounterIconType } from '../src/components/icons/IconResolver';

export type MarkCategoryInput = { name: string; emoji?: string | null };

/**
 * CATEGORY_MAP key for a mark: MARK_LIBRARY emoji match → resolveCounterIconType
 * → 'custom'. Identical behavior to the previous per-screen copies.
 */
export function resolveMarkCategory(mark: MarkCategoryInput): string {
  return (
    MARK_LIBRARY.find((m) => m.emoji === mark.emoji)?.category ??
    resolveCounterIconType({ name: mark.name, emoji: mark.emoji ?? '' }) ??
    'custom'
  );
}

/**
 * Majority category across a goal's marks (goal-detail hero medallion);
 * 'custom' when there are none. Ties resolve to the first category to reach
 * the winning count, in mark order.
 */
export function majorityCategory(marks: MarkCategoryInput[]): string {
  if (marks.length === 0) return 'custom';
  const counts = new Map<string, number>();
  for (const mark of marks) {
    const key = resolveMarkCategory(mark);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 'custom';
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}
