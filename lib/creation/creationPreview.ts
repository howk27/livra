// lib/creation/creationPreview.ts
// Pure derivations behind the QC2-H "The Card Takes Shape" creation flows:
// the live goal-card meta line and the live Focus-row preview identity.
// Everything here is unit-tested; the components only render these results.

import type { ComponentType } from 'react';
import { FREQUENCIES, type FrequencyId } from '../goalMarkSuggestions';
import type { FrequencyPreset } from '../markFrequencyPreset';
import { resolveMarkCategory, resolveMarkIcon } from '../markCategoryResolve';

/**
 * The assembling goal card's meta line, e.g. "Plan: 2 marks · 4–5 days/week".
 * Null until at least one mark is picked — the hollow card must look complete
 * with just a title (FU-7a), so emptiness renders nothing, not a zero.
 */
export function goalPlanMeta(markCount: number, frequency?: FrequencyId | null): string | null {
  if (markCount <= 0) return null;
  const marks = markCount === 1 ? '1 mark' : `${markCount} marks`;
  const cadence = frequency ? FREQUENCIES[frequency]?.range : undefined;
  return cadence ? `Plan: ${marks} · ${cadence}` : `Plan: ${marks}`;
}

/**
 * Cadence line under the mark-row preview, mirroring what the frequency
 * preset will mean on Focus. `dayCount` is only consulted for `custom`.
 */
export function cadenceLabel(preset: FrequencyPreset, dayCount: number): string {
  switch (preset) {
    case 'everyDay':
      return 'Every day';
    case 'threePerWeek':
      return '3x a week';
    case 'custom': {
      const n = Math.min(7, Math.max(1, Math.round(dayCount || 1)));
      if (n === 7) return 'Every day';
      return n === 1 ? '1 day a week' : `${n} days a week`;
    }
    default:
      return 'Every day';
  }
}

/**
 * Cadence line for a suggested-library pick. Fixed and abstinence marks are
 * every-day by nature (weeklyTargetForPreset resolves them to 7); variable
 * marks carry their recommended frequency.
 */
export function suggestedCadenceLabel(counter: {
  frequencyKind: 'variable' | 'fixed' | 'abstinence';
  frequency_recommended: number;
}): string {
  if (counter.frequencyKind === 'fixed' || counter.frequencyKind === 'abstinence') {
    return 'Every day';
  }
  const n = Math.min(7, Math.max(1, Math.round(counter.frequency_recommended || 3)));
  return n >= 7 ? 'Every day' : `${n}x a week`;
}

export type GoalCardContent<M> = {
  /** Trimmed why, or null → the card renders no why line. */
  why: string | null;
  /** Selected marks; empty → no tile strip. */
  marks: M[];
  /** Meta line, or null → no meta. */
  planMeta: string | null;
};

/**
 * Normalizes the goal card's optional content into render-ready slots, so the
 * card component is pure composition: each assembly state (title only /
 * +why / +marks / +meta) is decided here, once, and unit-tested.
 */
export function goalCardContent<M>(input: {
  why?: string;
  marks?: M[];
  planMeta?: string | null;
}): GoalCardContent<M> {
  const why = input.why?.trim();
  return {
    why: why ? why : null,
    marks: input.marks ?? [],
    planMeta: input.planMeta ?? null,
  };
}

export type MarkPreviewIdentity = {
  /** CATEGORY_MAP key — exactly what Focus will resolve for this mark. */
  category: string;
  /** Per-mark library glyph, or null → MarkRow keeps its category icon. */
  icon: ComponentType<any> | null;
};

/**
 * The identity Focus will give this mark once created. Runs the SAME
 * resolution pipeline as app/(tabs)/focus.tsx (resolveMarkCategory /
 * resolveMarkIcon over name + emoji), so the preview row and the eventual
 * Focus row can never disagree — the zero-translation-gap contract.
 */
export function markPreviewIdentity(name: string, emoji: string): MarkPreviewIdentity {
  const mark = { name, emoji };
  return {
    category: resolveMarkCategory(mark),
    icon: resolveMarkIcon(mark),
  };
}
