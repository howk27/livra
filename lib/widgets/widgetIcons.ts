import { categoryAccents } from '../../theme/tokens';

/**
 * Widget icon system — the app's OWN mark/goal icons, not raw emoji.
 *
 * In-app, a mark's tile and a goal's hero medallion render a Phosphor duotone
 * glyph keyed by mark category (components/ui/MarkRow.tsx CATEGORY_MAP), tinted
 * with the category accent. The widget is native SwiftUI and can't use Phosphor,
 * so each category maps to a bundled imageset that IS the exact Phosphor duotone
 * glyph with the accent baked in (see targets/LivraWidget/icons, generated from
 * phosphor-react-native's duotone path data). `icon` is the asset name rendered
 * via Image(...) in the widget; `accent` still drives the ring + tile background.
 *
 * Keys MUST stay in lockstep with CATEGORY_MAP in MarkRow; unknown keys fall
 * back to `custom` (the circle glyph), exactly as MarkRow does.
 */
export interface CategoryVisual {
  /** Bundled imageset name (the Phosphor duotone glyph, accent baked in). */
  icon: string;
  /** Category accent hex — matches theme categoryAccents. */
  accent: string;
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  // Phosphor glyph → bundled asset; accent → theme categoryAccents.
  Recovery: { icon: 'livra_moon', accent: categoryAccents.recovery },
  Fitness: { icon: 'livra_pulse', accent: categoryAccents.fitness },
  Health: { icon: 'livra_drop', accent: categoryAccents.health },
  Mindset: { icon: 'livra_heart', accent: categoryAccents.mindset },
  'Deep Work': { icon: 'livra_briefcase', accent: categoryAccents.deepWork },
  Creative: { icon: 'livra_pencil', accent: categoryAccents.creative },
  Discipline: { icon: 'livra_shield', accent: categoryAccents.discipline },
  Relationships: { icon: 'livra_users', accent: categoryAccents.relationships },
  Finance: { icon: 'livra_currency', accent: categoryAccents.finance },
  email: { icon: 'livra_envelope', accent: categoryAccents.email },
  // Legacy lowercase keys (mirror MarkRow's legacy rows)
  sleep: { icon: 'livra_moon', accent: categoryAccents.recovery },
  workout: { icon: 'livra_pulse', accent: categoryAccents.fitness },
  water: { icon: 'livra_drop', accent: categoryAccents.health },
  planning: { icon: 'livra_calendar', accent: categoryAccents.planning },
  reading: { icon: 'livra_book', accent: categoryAccents.creative },
  work: { icon: 'livra_briefcase', accent: categoryAccents.deepWork },
  custom: { icon: 'livra_circle', accent: categoryAccents.custom },
};

const CUSTOM_VISUAL: CategoryVisual = CATEGORY_VISUALS.custom;

/** Category key → { imageset name, accent }. Unknown keys resolve to `custom`. */
export function categoryVisual(category: string | undefined | null): CategoryVisual {
  if (!category) return CUSTOM_VISUAL;
  return CATEGORY_VISUALS[category] ?? CUSTOM_VISUAL;
}
