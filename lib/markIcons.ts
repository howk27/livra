import type { MarkType } from '@/src/types/counters';

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
 * Icon types offered in the picker grids, grouped by domain
 * (body → recovery → mind → learning → work → restraint).
 */
export const MARK_ICON_OPTIONS: SelectableMarkType[] = [
  'gym',
  'steps',
  'calories',
  'sleep',
  'rest',
  'water',
  'meditation',
  'mood',
  'reading',
  'study',
  'language',
  'journaling',
  'gratitude',
  'focus',
  'tasks',
  'planning',
  'email',
  'screen_free',
  'no_beer',
  'no_smoking',
  'no_sugar',
  'soda_free',
  'no_spending',
];
