import type { SuggestedCounter } from './suggestedCounters';
import type { Mark } from '../types';
import type { MarkType } from '@/src/types/counters';

export type MarkCategory = 'Productivity' | 'Fitness' | 'Wellness' | 'Learning' | 'Lifestyle';

export const CATEGORY_DEFAULT_COLORS: Record<MarkCategory, string> = {
  Productivity: '#3B82F6',
  Fitness: '#F97316',
  Wellness: '#10B981',
  Learning: '#A855F7',
  Lifestyle: '#9CA3AF',
};

const ICON_CATEGORY_MAP: Partial<Record<Exclude<MarkType, 'custom'>, MarkCategory>> = {
  email: 'Productivity',
  planning: 'Productivity',
  focus: 'Productivity',
  tasks: 'Productivity',
  gym: 'Fitness',
  steps: 'Fitness',
  calories: 'Fitness',
  no_beer: 'Lifestyle',
  no_smoking: 'Lifestyle',
  no_sugar: 'Lifestyle',
  no_spending: 'Lifestyle',
  water: 'Wellness',
  meditation: 'Wellness',
  sleep: 'Wellness',
  rest: 'Wellness',
  mood: 'Wellness',
  journaling: 'Learning',
  reading: 'Learning',
  study: 'Learning',
  language: 'Learning',
  gratitude: 'Learning',
  screen_free: 'Lifestyle',
  soda_free: 'Lifestyle',
};

const CATEGORY_KEYWORDS: Record<MarkCategory, string[]> = {
  Productivity: ['focus', 'task', 'email', 'plan', 'work', 'meeting', 'deep work'],
  Fitness: ['gym', 'run', 'step', 'walk', 'workout', 'calorie', 'exercise', 'lift', 'training'],
  Wellness: ['sleep', 'water', 'hydrate', 'meditat', 'rest', 'mood', 'mindful', 'wellness'],
  Learning: ['read', 'study', 'learn', 'language', 'journal', 'gratitude', 'book', 'course'],
  Lifestyle: ['habit', 'routine', 'home', 'life', 'money', 'screen', 'sugar', 'smok', 'beer'],
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function getCategoryColor(category: MarkCategory): string {
  return CATEGORY_DEFAULT_COLORS[category];
}

export function getCategoryForIcon(iconType: Exclude<MarkType, 'custom'>): MarkCategory {
  return ICON_CATEGORY_MAP[iconType] ?? 'Lifestyle';
}

export function getCategoryForSuggestedCounter(counter: SuggestedCounter): MarkCategory {
  const title = normalizeLabel(counter.name);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[MarkCategory, string[]]>) {
    if (keywords.some((keyword) => title.includes(keyword))) {
      return category;
    }
  }
  return 'Lifestyle';
}

export function getCategoryForMark(mark: Pick<Mark, 'name' | 'color'>): MarkCategory {
  const name = normalizeLabel(mark.name || '');
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[MarkCategory, string[]]>) {
    if (keywords.some((keyword) => name.includes(keyword))) {
      return category;
    }
  }
  return 'Lifestyle';
}

export function getCategoryColorForMark(mark: Pick<Mark, 'name' | 'color'>): string {
  return mark.color || getCategoryColor(getCategoryForMark(mark));
}
