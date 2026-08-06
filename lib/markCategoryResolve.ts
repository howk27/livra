// lib/markCategoryResolve.ts
// Shared mark → icon/category resolution for mark icon tiles (Focus, goal
// detail, mark detail). The app's own icons, never raw emoji in UI chrome
// (QC 2026-07-12). Single source of truth — extracted from
// app/(tabs)/focus.tsx and app/goal/[id].tsx (VD-4 retry #1, fallow
// duplication gate); per-mark icon fidelity added QC2-A (2026-07-14).

import type { ComponentType } from 'react';
import { MARK_LIBRARY, type MarkDefinition } from './suggestedCounters';
import { resolveCounterIconType } from '../src/components/icons/IconResolver';
import {
  colorForSuggestedCounter,
  getCategoryColorForMark,
  getCategoryForIcon,
  getCategoryColor,
  type MarkCategory,
} from './markCategory';
import {
  MARK_GLYPH_DEFS,
  CATEGORY_GLYPH_DEFS,
  FALLBACK_GLYPH_DEF,
  widgetAsset,
} from './markGlyphs';

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
 * M7-QC3 (founder device QC 2026-07-18): a mark's tint is its OWN per-icon
 * accent (`iconAccents`), the same value on every surface that renders it — the
 * Focus row, the mark-detail hero, the create grid. Before this, the hero used
 * `CATEGORY_MAP[cat].accent` and Focus used `getCategoryColorForMark`, both
 * category-level: a mark landed on one of 12 category hues, several of which are
 * warm tan/amber (fitness, discipline, finance, planning, relationships) — so
 * marks read "amber", not their own color, and a goal's marks were
 * indistinguishable. There is NO ember/`c.ember` leak; the amber IS the warm
 * categoryAccents family surfacing because per-icon accents were never wired in.
 *
 * Resolution order:
 *  1. A LIBRARY mark carries its icon's accent (`colorForSuggestedCounter`),
 *     exactly the hue the mark was created with — library ids with a picker
 *     twin map straight to `iconAccents`, the rest hash to a stable one.
 *  2. Otherwise honour a sanctioned STORED color (a hand-built mark saved its
 *     picked icon's accent), else heal a legacy/empty color to the category
 *     accent — genuine custom/unresolved marks alone reach the neutral fallback.
 *
 * Read-only, deterministic, sanctioned-palette in / sanctioned-palette out;
 * nothing is written, matching `getCategoryColorForMark`'s heal-on-read rule.
 */
export function resolveMarkAccent(mark: MarkCategoryInput & { color?: string | null }): string {
  const lib = resolveLibraryMark(mark);
  if (lib) return colorForSuggestedCounter(lib);
  return getCategoryColorForMark({ name: mark.name, color: mark.color ?? undefined });
}

/**
 * A `MarkCategory` key → the CATEGORY_MAP key that renders it.
 *
 * Three of the twelve are lowercase in CATEGORY_MAP (`email`, `planning`,
 * `custom`) so this is NOT `CATEGORY_LABELS` — using that table would send
 * `email` marks to a nonexistent `'Email'` row and back into the circle.
 */
const CATEGORY_TO_MAP_KEY: Record<MarkCategory, string> = {
  recovery: 'Recovery',
  fitness: 'Fitness',
  health: 'Health',
  mindset: 'Mindset',
  deepWork: 'Deep Work',
  creative: 'Creative',
  discipline: 'Discipline',
  relationships: 'Relationships',
  finance: 'Finance',
  email: 'email',
  planning: 'planning',
  custom: 'custom',
};

/**
 * The inverse: a CATEGORY_MAP key → the accent bucket it draws from. Needed
 * because CATEGORY_MAP carries six LEGACY rows (`sleep`, `workout`, `water`,
 * `reading`, `work`, plus lowercase `email`/`planning`) that are not category
 * names, and a goal with no marks still has to land on a sanctioned hue.
 * Mirrors the accents in the CATEGORY_MAP rows themselves — `reading` draws the
 * creative accent, `work` the deepWork one.
 */
const MAP_KEY_TO_CATEGORY: Record<string, MarkCategory> = {
  Recovery: 'recovery',
  Fitness: 'fitness',
  Health: 'health',
  Mindset: 'mindset',
  'Deep Work': 'deepWork',
  Creative: 'creative',
  Discipline: 'discipline',
  Relationships: 'relationships',
  Finance: 'finance',
  email: 'email',
  sleep: 'recovery',
  workout: 'fitness',
  water: 'health',
  planning: 'planning',
  reading: 'creative',
  work: 'deepWork',
  custom: 'custom',
};

/**
 * CATEGORY_MAP key for a mark: MARK_LIBRARY match (name-first, emoji fallback)
 * → resolveCounterIconType → 'custom'.
 *
 * 2026-08-06 — THE NAMESPACE COLLISION, FIXED. `resolveCounterIconType` returns
 * a **MarkType** (`'gym'`, `'calories'`, `'meditation'`…) and this fed it
 * straight into a table keyed by **category**. Only 5 of its 23 possible
 * returns existed there (`email`, `planning`, `reading`, `sleep`, `water`); the
 * other 18 missed and rendered the plain custom CIRCLE, in the app AND the
 * widget. A hand-built mark called "Gym" resolved to `'gym'` while the table's
 * key is `'workout'` — circle.
 *
 * A MarkType that IS a CATEGORY_MAP key still wins, because those legacy rows
 * are more specific than their category (`reading` → BookOpen beats Deep Work →
 * Briefcase). Everything else now routes through the mark's real category.
 */
export function resolveMarkCategory(mark: MarkCategoryInput): string {
  const library = resolveLibraryMark(mark);
  if (library) return library.category;

  const iconType = resolveCounterIconType({ name: mark.name, emoji: mark.emoji ?? '' });
  if (!iconType || iconType === 'custom') return 'custom';
  // A legacy CATEGORY_MAP row for this exact icon type is the narrower answer.
  if (iconType in CATEGORY_GLYPH_DEFS) return iconType;
  return CATEGORY_TO_MAP_KEY[getCategoryForIcon(iconType)] ?? 'custom';
}

/**
 * A mark's FACE as the widget needs it: a bundled asset name + the accent, both
 * resolved from exactly the same inputs the in-app render uses.
 *
 * This is the app↔widget contract. The app draws `resolveMarkIcon` (the mark's
 * OWN library component) tinted `resolveMarkAccent`; the widget cannot hold a
 * component, so it gets the same glyph's asset key and the same accent hex.
 * Both sides now answer "what does this mark look like?" from one function —
 * before, the widget asked a different question (what does its CATEGORY look
 * like?) and got a different answer for 40 of 41 library marks.
 */
export interface MarkFace {
  /** Bundled widget imageset name, e.g. `livra_moon_stars`. */
  icon: string;
  /** Accent hex — the mark's own per-icon hue, not a category hue. */
  accent: string;
}

export function resolveMarkFace(mark: MarkCategoryInput & { color?: string | null }): MarkFace {
  const library = resolveLibraryMark(mark);
  const def = library
    ? MARK_GLYPH_DEFS[library.id]
    : CATEGORY_GLYPH_DEFS[resolveMarkCategory(mark)];
  return {
    icon: widgetAsset(def ?? FALLBACK_GLYPH_DEF),
    accent: resolveMarkAccent(mark),
  };
}

/**
 * A GOAL's face, by the same rule the Goals-screen medallion and the goal-detail
 * hero already use: the DOMINANT (most-logged) mark's own face, falling back to
 * the majority category when the goal has no marks.
 *
 * 2026-08-06: the widget used to pick with `majorityCategory` while both in-app
 * surfaces picked with `dominantMark` — two different selection algorithms over
 * the same goal, so the same goal wore two different faces even before the
 * per-mark/per-category collapse. One function now, called by both.
 */
export function resolveGoalFace<T extends MarkCategoryInput & { total?: number | null; color?: string | null }>(
  marks: T[],
): MarkFace {
  const hero = dominantMark(marks);
  if (hero) return resolveMarkFace(hero);
  const category = majorityCategory(marks);
  return {
    icon: widgetAsset(CATEGORY_GLYPH_DEFS[category] ?? FALLBACK_GLYPH_DEF),
    accent: getCategoryColor(MAP_KEY_TO_CATEGORY[category] ?? 'custom'),
  };
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
