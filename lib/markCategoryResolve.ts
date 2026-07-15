// lib/markCategoryResolve.ts
// Shared mark → icon/category resolution for mark icon tiles (Focus, goal
// detail, mark detail). The app's own icons, never raw emoji in UI chrome
// (QC 2026-07-12). Single source of truth — extracted from
// app/(tabs)/focus.tsx and app/goal/[id].tsx (VD-4 retry #1, fallow
// duplication gate); per-mark icon fidelity added QC2-A (2026-07-14).

import type { ComponentType } from 'react';
import { MARK_LIBRARY, type MarkDefinition } from './suggestedCounters';
import { resolveCounterIconType } from '../src/components/icons/IconResolver';

export type MarkCategoryInput = { name: string; emoji?: string | null };

/**
 * The MARK_LIBRARY entry a created mark came from, if any.
 *
 * Matching key (QC2-A): created marks persist only `name` + `emoji` — there is
 * no stored library id — so we match by NAME first (case-insensitive, trimmed;
 * library names are unique), with EMOJI as the fallback. Name-first makes the
 * resolver immune to emoji collisions inside the library ('🚫' is shared by
 * no-alcohol and no-sugar) and to legacy emoji reassignments (old marks whose
 * '🧘' once meant meditation). The emoji fallback still catches AI-created
 * marks, whose emoji is copied from the library but whose name is
 * model-authored. A RENAMED mark with a colliding emoji resolves to the first
 * library entry carrying that emoji — the one genuinely ambiguous case.
 */
export function resolveLibraryMark(mark: MarkCategoryInput): MarkDefinition | undefined {
  const name = mark.name.trim().toLowerCase();
  return (
    MARK_LIBRARY.find((m) => m.name.toLowerCase() === name) ??
    (mark.emoji ? MARK_LIBRARY.find((m) => m.emoji === mark.emoji) : undefined)
  );
}

/**
 * The mark's OWN library icon (e.g. stretch → PersonSimpleIcon), or null for
 * custom/unmatched marks — callers keep their CATEGORY_MAP icon fallback.
 * Accent colors stay categorical everywhere; this changes glyphs only.
 */
export function resolveMarkIcon(mark: MarkCategoryInput): ComponentType<any> | null {
  return resolveLibraryMark(mark)?.icon ?? null;
}

/**
 * CATEGORY_MAP key for a mark: MARK_LIBRARY match (name-first, emoji fallback)
 * → resolveCounterIconType → 'custom'.
 */
export function resolveMarkCategory(mark: MarkCategoryInput): string {
  return (
    resolveLibraryMark(mark)?.category ??
    resolveCounterIconType({ name: mark.name, emoji: mark.emoji ?? '' }) ??
    'custom'
  );
}

/**
 * The goal-detail medallion's dominant mark: the most-logged linked mark
 * (all-time `total`), ties broken by first in mark order. Null when the goal
 * has no marks — the medallion keeps its category/custom fallback.
 */
export function dominantMark<T extends { total?: number | null }>(marks: T[]): T | null {
  let best: T | null = null;
  let bestTotal = -1;
  for (const mark of marks) {
    const total = mark.total ?? 0;
    if (total > bestTotal) {
      best = mark;
      bestTotal = total;
    }
  }
  return best;
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
