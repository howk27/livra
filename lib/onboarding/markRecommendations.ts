import type { FocusArea } from '@/state/onboardingSlice';
import { MARK_LIBRARY, type MarkDefinition } from '@/lib/suggestedCounters';

export type { MarkDefinition as MarkTemplate };

// Goal templates with metadata for dropdown selection.
// minMarks is internal only — never shown to the user.
// free tier hard cap is 3 marks. Livra+ is unlimited.
export type GoalTemplate = {
  id: string;
  name: string;
  category: string;
  recommendedMarkIds: string[];
  minMarks: number;
};

export const GOAL_TEMPLATES: GoalTemplate[] = [
  // FITNESS
  { id: 'marathon', name: 'Run a Marathon', category: 'Fitness', recommendedMarkIds: ['run', 'steps', 'sleep', 'water', 'stretch'], minMarks: 3 },
  { id: 'lose-weight', name: 'Lose Weight', category: 'Fitness', recommendedMarkIds: ['workout', 'calories', 'water', 'nutrition', 'sleep'], minMarks: 3 },
  { id: 'build-muscle', name: 'Build Muscle', category: 'Fitness', recommendedMarkIds: ['workout', 'nutrition', 'sleep', 'water', 'vitamins'], minMarks: 3 },
  { id: 'run-5k', name: 'Run a 5K', category: 'Fitness', recommendedMarkIds: ['run', 'steps', 'sleep', 'water'], minMarks: 2 },
  { id: 'triathlon', name: 'Complete a Triathlon', category: 'Fitness', recommendedMarkIds: ['swim', 'cycling', 'run', 'sleep', 'nutrition'], minMarks: 3 },
  { id: 'get-active', name: 'Get More Active', category: 'Fitness', recommendedMarkIds: ['steps', 'workout', 'water'], minMarks: 2 },

  // HEALTH
  { id: 'eat-better', name: 'Eat Better', category: 'Health', recommendedMarkIds: ['nutrition', 'cooking', 'water', 'no-sugar'], minMarks: 2 },
  { id: 'quit-alcohol', name: 'Quit Drinking', category: 'Health', recommendedMarkIds: ['no-alcohol', 'journaling', 'meditation'], minMarks: 2 },
  { id: 'quit-sugar', name: 'Cut Out Sugar', category: 'Health', recommendedMarkIds: ['no-sugar', 'nutrition', 'water'], minMarks: 2 },
  { id: 'better-sleep', name: 'Sleep Better', category: 'Health', recommendedMarkIds: ['sleep', 'no-phone', 'breathwork'], minMarks: 2 },
  { id: 'lose-fat', name: 'Get Lean', category: 'Health', recommendedMarkIds: ['calories', 'workout', 'water', 'nutrition', 'sleep'], minMarks: 3 },

  // MINDSET
  { id: 'reduce-stress', name: 'Reduce Stress', category: 'Mindset', recommendedMarkIds: ['meditation', 'breathwork', 'journaling', 'sleep'], minMarks: 2 },
  { id: 'mental-health', name: 'Improve Mental Health', category: 'Mindset', recommendedMarkIds: ['meditation', 'journaling', 'gratitude', 'sleep', 'socialize'], minMarks: 3 },
  { id: 'mindfulness', name: 'Practice Mindfulness', category: 'Mindset', recommendedMarkIds: ['meditation', 'breathwork', 'gratitude'], minMarks: 2 },
  { id: 'confidence', name: 'Build Confidence', category: 'Mindset', recommendedMarkIds: ['affirmations', 'journaling', 'workout'], minMarks: 2 },

  // DEEP WORK
  { id: 'learn-skill', name: 'Learn a New Skill', category: 'Deep Work', recommendedMarkIds: ['practice', 'study', 'focus', 'reading'], minMarks: 2 },
  { id: 'read-books', name: 'Read More Books', category: 'Deep Work', recommendedMarkIds: ['reading', 'no-phone', 'planning'], minMarks: 2 },
  { id: 'build-business', name: 'Build a Business', category: 'Deep Work', recommendedMarkIds: ['deep-work', 'planning', 'focus', 'networking', 'finance'], minMarks: 3 },
  { id: 'learn-instrument', name: 'Learn an Instrument', category: 'Deep Work', recommendedMarkIds: ['practice', 'focus', 'planning'], minMarks: 2 },
  { id: 'pass-exam', name: 'Pass an Exam', category: 'Deep Work', recommendedMarkIds: ['study', 'focus', 'sleep', 'planning'], minMarks: 3 },
  { id: 'write-book', name: 'Write a Book', category: 'Deep Work', recommendedMarkIds: ['deep-work', 'focus', 'planning', 'reading'], minMarks: 2 },
  { id: 'learn-language', name: 'Learn a Language', category: 'Deep Work', recommendedMarkIds: ['practice', 'study', 'focus'], minMarks: 2 },

  // FINANCE
  { id: 'save-money', name: 'Save Money', category: 'Finance', recommendedMarkIds: ['saving', 'no-spend', 'finance', 'cooking'], minMarks: 2 },
  { id: 'pay-debt', name: 'Pay Off Debt', category: 'Finance', recommendedMarkIds: ['finance', 'saving', 'no-spend', 'side-hustle'], minMarks: 2 },
  { id: 'start-investing', name: 'Start Investing', category: 'Finance', recommendedMarkIds: ['invest', 'finance', 'reading', 'planning'], minMarks: 2 },
  { id: 'side-income', name: 'Build a Side Income', category: 'Finance', recommendedMarkIds: ['side-hustle', 'deep-work', 'networking', 'planning'], minMarks: 2 },

  // DISCIPLINE
  { id: 'morning-routine', name: 'Build a Morning Routine', category: 'Discipline', recommendedMarkIds: ['wake-early', 'cold-shower', 'meditation', 'planning'], minMarks: 2 },
  { id: 'digital-detox', name: 'Digital Detox', category: 'Discipline', recommendedMarkIds: ['no-phone', 'screen-time', 'journaling', 'creative'], minMarks: 2 },

  // RELATIONSHIPS
  { id: 'social-life', name: 'Improve Social Life', category: 'Relationships', recommendedMarkIds: ['socialize', 'networking', 'volunteer'], minMarks: 2 },
  { id: 'family-time', name: 'Spend More Time with Family', category: 'Relationships', recommendedMarkIds: ['family', 'no-phone', 'planning'], minMarks: 2 },

  // CREATIVE
  { id: 'creative-project', name: 'Finish a Creative Project', category: 'Creative', recommendedMarkIds: ['creative', 'deep-work', 'focus', 'planning'], minMarks: 2 },
];

export const GOAL_TEMPLATES_BY_CATEGORY = Object.entries(
  GOAL_TEMPLATES.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, GoalTemplate[]>)
).map(([category, templates]) => ({ category, templates }));

/**
 * Returns recommended marks for a goal template.
 * Paywall-aware: free users get top 3, Livra+ gets all recommendations.
 * If matches exceed 3 for free users, caller must show soft upsell line.
 */
export function getRecommendedMarksForGoal(
  goalTemplateId: string,
  isPremium: boolean,
): { marks: MarkDefinition[]; hasMore: boolean } {
  const template = GOAL_TEMPLATES.find((t) => t.id === goalTemplateId);
  if (!template) return { marks: [], hasMore: false };

  const marks = template.recommendedMarkIds
    .map((id) => MARK_LIBRARY.find((m) => m.id === id))
    .filter((m): m is MarkDefinition => Boolean(m));

  if (isPremium) return { marks, hasMore: false };

  const FREE_CAP = 3;
  const hasMore = marks.length > FREE_CAP;
  return { marks: marks.slice(0, FREE_CAP), hasMore };
}

/**
 * Legacy function — kept for onboarding Screen 4 (identity-based selection).
 * Do not use for goal-based recommendations. Use getRecommendedMarksForGoal instead.
 */
export function getRecommendedMarks(
  selections: string[],
  focusArea: FocusArea | null,
): MarkDefinition[] {
  if (selections.length === 0) return [];

  const LEGACY_MAP: Record<string, string> = {
    'Sleep better': 'sleep',
    'Move my body': 'workout',
    'Drink more water': 'water',
    'Read consistently': 'reading',
    'Plan my days': 'planning',
    'Practice focus': 'focus',
    'Build a skill': 'practice',
    'Track my finances': 'finance',
  };

  const FOCUS_PRIORITY: Partial<Record<FocusArea, string[]>> = {
    health: ['sleep', 'workout', 'water'],
    career: ['focus', 'planning', 'practice'],
    creativity: ['practice', 'focus', 'sleep'],
    learning: ['reading', 'practice', 'focus'],
    finances: ['finance', 'planning'],
  };

  const ids = selections.map((s) => LEGACY_MAP[s]).filter(Boolean);
  const marks = ids
    .map((id) => MARK_LIBRARY.find((m) => m.id === id))
    .filter((m): m is MarkDefinition => Boolean(m));

  if (marks.length <= 3) return marks;

  const priorityList = focusArea ? (FOCUS_PRIORITY[focusArea] ?? []) : [];
  const scored = marks.map((mark, i) => {
    const pi = priorityList.indexOf(mark.id);
    return { mark, priorityScore: pi === -1 ? priorityList.length : pi, i };
  });
  scored.sort((a, b) => a.priorityScore !== b.priorityScore ? a.priorityScore - b.priorityScore : a.i - b.i);
  return scored.slice(0, 3).map((s) => s.mark);
}
