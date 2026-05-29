import type { FocusArea } from '../../state/onboardingSlice';

export interface MarkTemplate {
  name: string;
  identity_label: string;
  icon: string;
  default_color: string;
  health_kit_type: string | null;
}

// Keyed by Screen 4 option label
export const MARK_TEMPLATES: Record<string, MarkTemplate> = {
  'Sleep better': {
    name: 'Sleep',
    identity_label: 'Recovery',
    icon: '🌙',
    default_color: '#7B9EA6',
    health_kit_type: 'sleep',
  },
  'Move my body': {
    name: 'Workout',
    identity_label: 'Strength',
    icon: '💪',
    default_color: '#8A7E6B',
    health_kit_type: 'workout',
  },
  'Drink more water': {
    name: 'Water',
    identity_label: 'Vitality',
    icon: '💧',
    default_color: '#6B9E8A',
    health_kit_type: null,
  },
  'Read consistently': {
    name: 'Reading',
    identity_label: 'Growth',
    icon: '📚',
    default_color: '#8A6B7B',
    health_kit_type: null,
  },
  'Plan my days': {
    name: 'Planning',
    identity_label: 'Clarity',
    icon: '🗓️',
    default_color: '#9E8A6B',
    health_kit_type: null,
  },
  'Practice focus': {
    name: 'Focus',
    identity_label: 'Focus',
    icon: '🎯',
    default_color: '#8A9E8A',
    health_kit_type: null,
  },
  'Build a skill': {
    name: 'Practice',
    identity_label: 'Mastery',
    icon: '⚡',
    default_color: '#7B6B9E',
    health_kit_type: null,
  },
  'Track my finances': {
    name: 'Finance',
    identity_label: 'Discipline',
    icon: '💰',
    default_color: '#9E7B6B',
    health_kit_type: null,
  },
};

// Focus area priority: mark names in descending priority order.
// 'relationships' is omitted — no override; falls back to selection order.
const FOCUS_AREA_PRIORITY: Partial<Record<FocusArea, string[]>> = {
  health: ['Sleep', 'Workout', 'Water'],
  career: ['Focus', 'Planning', 'Practice'],
  creativity: ['Practice', 'Focus', 'Sleep'],
  learning: ['Reading', 'Practice', 'Focus'],
  finances: ['Finance', 'Planning'],
};

/**
 * Returns 2–3 recommended MarkTemplates based on Screen 4 selections and the user's focus area.
 *
 * Rules:
 * - Empty selections → []
 * - ≤3 selections → return all in selection order
 * - >3 selections → score by focus area priority list position and return top 3.
 *   Ties broken by original selection order. focusArea null → first 3 in selection order.
 */
export function getRecommendedMarks(
  selections: string[],
  focusArea: FocusArea | null,
): MarkTemplate[] {
  if (selections.length === 0) return [];

  const templates = selections
    .map((label) => MARK_TEMPLATES[label])
    .filter((t): t is MarkTemplate => Boolean(t));

  if (templates.length <= 3) return templates;

  // Need to reduce to 3 using priority scoring
  const priorityList = focusArea ? (FOCUS_AREA_PRIORITY[focusArea] ?? []) : [];

  const scored = templates.map((template, selectionIndex) => {
    const priorityIndex = priorityList.indexOf(template.name);
    // Lower priorityScore = higher priority. Not in list = pushed after all listed marks.
    const priorityScore = priorityIndex === -1 ? priorityList.length : priorityIndex;
    return { template, priorityScore, selectionIndex };
  });

  scored.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
    return a.selectionIndex - b.selectionIndex;
  });

  return scored.slice(0, 3).map((s) => s.template);
}
