export type SuggestedMark = {
  name: string;
  emoji: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
};

export type MarkCategory = {
  title: string;
  emoji: string;
  marks: SuggestedMark[];
};

export const SUGGESTED_MARKS_BY_CATEGORY: MarkCategory[] = [
  {
    title: 'Fitness',
    emoji: '💪',
    marks: [
      { name: 'Workouts', emoji: '🏋️', color: '#3B82F6', unit: 'sessions' },
      { name: 'Steps', emoji: '👣', color: '#10B981', unit: 'items' },
      { name: 'Water Bottles', emoji: '💧', color: '#06B6D4', unit: 'items' },
      { name: 'Rest Day', emoji: '🛌', color: '#06B6D4', unit: 'days' },
    ],
  },
  {
    title: 'Wellness',
    emoji: '🧘',
    marks: [
      { name: 'Sleep', emoji: '😴', color: '#6366F1', unit: 'items' },
      { name: 'Meditation', emoji: '🧘', color: '#9333EA', unit: 'sessions' },
    ],
  },
  {
    title: 'Learning & Growth',
    emoji: '📚',
    marks: [
      { name: 'Language Practice', emoji: '🗣️', color: '#A855F7', unit: 'sessions' },
      { name: 'Study', emoji: '📚', color: '#3B82F6', unit: 'sessions' },
      { name: 'Reading', emoji: '📖', color: '#10B981', unit: 'sessions' },
    ],
  },
  {
    title: 'Productivity',
    emoji: '⚡',
    marks: [
      { name: 'Planning', emoji: '🗓️', color: '#6366F1', unit: 'sessions' },
      { name: 'Focus', emoji: '🎯', color: '#F97316', unit: 'sessions' },
      { name: 'Tasks', emoji: '✅', color: '#10B981', unit: 'items' },
      { name: 'Email', emoji: '📧', color: '#06B6D4', unit: 'items' },
    ],
  },
  {
    title: 'Habit Breaking',
    emoji: '🚫',
    marks: [
      { name: 'No Soda', emoji: '🥤', color: '#10B981', unit: 'days' },
    ],
  },
];

// Flattened list of all marks for easier access
export const ALL_SUGGESTED_MARKS: SuggestedMark[] = SUGGESTED_MARKS_BY_CATEGORY.flatMap(
  (category) => category.marks
);

// Export as SuggestedCounter for backwards compatibility
export type SuggestedCounter = SuggestedMark;

// Export as SUGGESTED_COUNTERS_BY_CATEGORY for backwards compatibility
// Maps the "Marks" structure to the "Counters" structure expected by components
export const SUGGESTED_COUNTERS_BY_CATEGORY = SUGGESTED_MARKS_BY_CATEGORY.map((category) => ({
  ...category,
  counters: category.marks, // Map marks to counters
}));

// Export as ALL_SUGGESTED_COUNTERS for backwards compatibility
export const ALL_SUGGESTED_COUNTERS: SuggestedCounter[] = ALL_SUGGESTED_MARKS;