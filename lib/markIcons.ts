import type { MarkType } from '@/src/types/counters';
import { CATEGORY_LABELS, getCategoryForIcon, type MarkCategory } from './markCategory';

/**
 * Single source of truth for the manual mark-icon picker (creation + edit).
 *
 * VD-7 retry #1: `ICON_TYPE_TO_EMOJI` and the selectable icon list were
 * duplicated between app/mark/new.tsx and app/mark/[id]/edit.tsx and had
 * started to diverge (creation extended to 23 icons, edit kept its own copy).
 * Both screens now import from here.
 *
 * The list covers every existing MarkType with CounterIcon support. AI icon
 * keys with no MarkType equivalent (run, stretch, nutrition, meal-prep,
 * breathwork, wake-early, socialize, family, creative, writing, saving) are
 * documented as unmappable in the VD-7 build report — no MarkType values are
 * invented here.
 */

export type SelectableMarkType = Exclude<MarkType, 'custom'>;

/** Icon type → emoji, for storage compatibility (marks persist an emoji). */
export const ICON_TYPE_TO_EMOJI: Record<SelectableMarkType, string> = {
  email: '📧',
  planning: '🗓️',
  focus: '🎯',
  tasks: '✅',
  language: '🗣️',
  study: '📚',
  reading: '📖',
  calories: '🔥',
  soda_free: '🥤',
  rest: '🛌',
  meditation: '🧘',
  sleep: '🌙',
  gym: '🏋️',
  steps: '👣',
  water: '💧',
  no_sugar: '🚫',
  no_beer: '🍺',
  no_spending: '💰',
  mood: '😊',
  no_smoking: '🚭',
  screen_free: '📱',
  gratitude: '🙏',
  journaling: '📝',
};

/**
 * QC4-F: the picker grid is a 4x4 collapsed by default with a "Show more"
 * disclosure, so the split between what shows first and what hides is now a
 * real product decision and lives here — not as an accident of array order.
 *
 * PRIMARY (the collapsed 4x4) = the "do more of this" habits. The split is
 * evidence-led, not taste:
 *   - Every mark on the founder-curated popular shortlist (POPULAR_MARK_IDS in
 *     app/mark/new.tsx: run, workout, reading, meditation, water, sleep,
 *     journaling, study) resolves into this set — gym covers run/workout.
 *   - The remainder fills out the same domains those anchors sit in: fitness
 *     (steps, calories), recovery (rest), wellness (mood), learning (language,
 *     gratitude), work (focus, tasks, planning).
 *
 * SECONDARY (behind "Show more") = the restraint/avoidance set (the no_* marks,
 * soda_free, screen_free) plus email, the narrowest work icon. Restraint marks
 * are a real but minority use case, and leading with a wall of "no" glyphs is
 * exactly the guilt-forward first impression PRODUCT.md rules out. They are one
 * tap away, not gone.
 *
 * QC5-A: within each group the order is CATEGORY-CONTIGUOUS — every icon of a
 * category sits next to its siblings, in the order `getCategoryForIcon` resolves
 * them. `groupMarkIcons` partitions on exactly that, so array order and rendered
 * order are the same fact and cannot drift. Same 16 members as QC4-F; only the
 * sequence moved.
 */
export const MARK_ICON_PRIMARY: SelectableMarkType[] = [
  // fitness
  'gym',
  'steps',
  // health
  'calories',
  'water',
  // recovery
  'sleep',
  'rest',
  // mindset
  'meditation',
  'mood',
  'journaling',
  'gratitude',
  // deep work
  'reading',
  'study',
  'language',
  'focus',
  'tasks',
  'planning',
];

/**
 * QC5-A: ordered so the restraint marks (all `health`) land FIRST. Expanding the
 * grid then extends the health group that is already on screen, rather than
 * opening a second Health heading further down — the categories a user can
 * already see grow in place, and only genuinely new ones (Discipline, Finance,
 * Email) are appended at the end.
 */
export const MARK_ICON_SECONDARY: SelectableMarkType[] = [
  // health (the restraint set)
  'no_beer',
  'no_smoking',
  'no_sugar',
  'soda_free',
  // the narrow tail — categories that exist only once the grid is expanded
  'screen_free',
  'no_spending',
  'email',
];

/**
 * Every icon type offered in the picker grids. PRIMARY first so expanding the
 * grid only ever appends a row — the icons already on screen never reflow.
 */
export const MARK_ICON_OPTIONS: SelectableMarkType[] = [
  ...MARK_ICON_PRIMARY,
  ...MARK_ICON_SECONDARY,
];

/** One rendered band of the picker: a category and the icons that resolve to it. */
export type MarkIconGroup = {
  category: MarkCategory;
  /** Display name from CATEGORY_LABELS — never a second, invented name. */
  label: string;
  icons: SelectableMarkType[];
};

/**
 * QC5-A — the grid itself says the category, so nothing has to reserve a slot to
 * name it.
 *
 * Founder: "What happened with the 4x4 grid on new marks, If you are leaving that
 * space for the category, dont. Just add a break in between the 4x4 cards to mark
 * the following category of Icons."
 *
 * Category comes from `getCategoryForIcon` (lib/markCategory.ts) — the same
 * resolver that decides the mark's saved COLOR. There is no second mapping here,
 * by construction: the break the user sees and the color the mark gets are the
 * same answer to the same question.
 *
 * Order is first-appearance in the passed list, and an icon joins the group that
 * is already open rather than starting a duplicate one. That is what makes the
 * "Show more" disclosure extend the visible groups instead of appending an
 * ungrouped tail: the collapsed call passes PRIMARY, the expanded call passes
 * PRIMARY + SECONDARY, and every secondary icon whose category is already on
 * screen lands inside that existing band.
 */
export function groupMarkIcons(icons: readonly SelectableMarkType[]): MarkIconGroup[] {
  const groups: MarkIconGroup[] = [];
  const byCategory = new Map<MarkCategory, MarkIconGroup>();

  for (const iconType of icons) {
    const category = getCategoryForIcon(iconType);
    const existing = byCategory.get(category);
    if (existing) {
      existing.icons.push(iconType);
      continue;
    }
    const group: MarkIconGroup = { category, label: CATEGORY_LABELS[category], icons: [iconType] };
    byCategory.set(category, group);
    groups.push(group);
  }

  return groups;
}
