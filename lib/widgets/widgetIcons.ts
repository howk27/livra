import { categoryAccents } from '../../theme/tokens';

/**
 * Native (SF Symbol) mirror of the app's mark/goal icon system.
 *
 * In-app, a mark's icon tile and a goal's hero medallion are rendered from the
 * mark *category* — never the raw emoji ("The app's own icons, never raw emoji
 * in UI chrome", markCategoryResolve.ts). The RN UI uses Phosphor glyphs keyed
 * by CATEGORY_MAP (components/ui/MarkRow.tsx); the widget is native SwiftUI and
 * cannot use those, so each category maps to the closest SF Symbol plus the
 * same category accent color.
 *
 * Keys here MUST stay in lockstep with CATEGORY_MAP in MarkRow. Unknown keys
 * fall back to `custom`, exactly as MarkRow does (`CATEGORY_MAP[k] ?? custom`).
 */
export interface CategoryVisual {
  /** SF Symbol name rendered via Image(systemName:) in the widget. */
  symbol: string;
  /** Category accent hex — matches theme categoryAccents. */
  accent: string;
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  // Phosphor icon → nearest SF Symbol; accent → theme categoryAccents.
  Recovery: { symbol: 'moon.fill', accent: categoryAccents.recovery },
  Fitness: { symbol: 'waveform.path.ecg', accent: categoryAccents.fitness },
  Health: { symbol: 'drop.fill', accent: categoryAccents.health },
  Mindset: { symbol: 'heart.fill', accent: categoryAccents.mindset },
  'Deep Work': { symbol: 'briefcase.fill', accent: categoryAccents.deepWork },
  Creative: { symbol: 'pencil', accent: categoryAccents.creative },
  Discipline: { symbol: 'shield.fill', accent: categoryAccents.discipline },
  Relationships: { symbol: 'person.2.fill', accent: categoryAccents.relationships },
  Finance: { symbol: 'dollarsign.circle.fill', accent: categoryAccents.finance },
  email: { symbol: 'envelope.fill', accent: categoryAccents.email },
  // Legacy lowercase keys (mirror MarkRow's legacy rows)
  sleep: { symbol: 'moon.fill', accent: categoryAccents.recovery },
  workout: { symbol: 'waveform.path.ecg', accent: categoryAccents.fitness },
  water: { symbol: 'drop.fill', accent: categoryAccents.health },
  planning: { symbol: 'calendar', accent: categoryAccents.planning },
  reading: { symbol: 'book.fill', accent: categoryAccents.creative },
  work: { symbol: 'briefcase.fill', accent: categoryAccents.deepWork },
  custom: { symbol: 'circle.fill', accent: categoryAccents.custom },
};

const CUSTOM_VISUAL: CategoryVisual = CATEGORY_VISUALS.custom;

/** Category key → { SF Symbol, accent }. Unknown keys resolve to `custom`. */
export function categoryVisual(category: string | undefined | null): CategoryVisual {
  if (!category) return CUSTOM_VISUAL;
  return CATEGORY_VISUALS[category] ?? CUSTOM_VISUAL;
}
