# Audit Mode — marks-update.md

BEFORE TOUCHING ANY CODE:

1. Read CLAUDE.md

3. Read this document in full

Then audit the codebase against this plan. For each task, report:

- READY: file exists, shape matches, no conflicts

- CONFLICT: file exists but shape differs — describe exactly what conflicts

- MISSING: file or export referenced in plan does not exist

- RISK: implementation detail in plan that may not work given current codebase

Output a structured report grouped by task. Do NOT write any code. Do NOT make any changes. Audit only.


# Goal → Mark Intelligence + Commitment System + Onboarding Restructure
## Claude Code Implementation Prompt

> **Read before touching anything:** `CLAUDE.md`, `docs/livra-plan-final.md`. Goals are stored in AsyncStorage via `lib/db/goalsDb.ts` (key `@livra_goals`), NOT in SQLite. Marks live in SQLite (`lc_counters`). The `Goal` type lives in `types/goal.ts`.

---

## Overview

This prompt implements three connected systems in one feature branch:

1. **Goal → Mark Intelligence** — creating a goal surfaces relevant marks via tag matching
2. **Commitment System** — tier + frequency selection drives a calculated completion threshold; "Complete" button is gated behind 80% of expected check-ins
3. **Onboarding Restructure** — onboarding shifts from mark-first to goal-first; user exits onboarding with an active goal and associated marks already set

Execute tasks in order. Each task commits independently. Do not start the next task until all tests pass and the commit is made.

---

## Hard Rules

- Do NOT modify `lib/db/index.ts` (SQLite mock) schema — goals are AsyncStorage only
- Do NOT add new npm packages without checking `package.json` first
- Do NOT rename or remove existing exports from `lib/suggestedCounters.ts` — backwards compat must be preserved
- Do NOT touch `state/countersSlice.ts` or core mark logic
- Do NOT enable New Architecture
- Run `npm run type-check` and `npm run test` before every commit — fix all errors before proceeding
- Every UI string uses design system tokens — never hardcode hex values

---

## System Design Reference

### Tier → Duration mapping
| Tier ID | Label | Duration weeks | Description shown to user |
|---|---|---|---|
| `starting` | Just starting | 6 | First attempt, building the habit |
| `building` | Building consistency | 10 | Some experience, making it stick |
| `leveling` | Leveling up | 16 | Comfortable, pushing further |
| `all-in` | All in | 24 | High commitment, serious outcome |

### Frequency → Days per week mapping
| Frequency ID | Label | Days/week | Rest days |
|---|---|---|---|
| `light` | Light | 2–3 | 4–5 |
| `steady` | Steady | 4–5 | 2–3 |
| `pushing` | Pushing past | 5–6 | 1–2 |

### Tier → Default frequency + allowed overrides
| Tier | Default | Allowed overrides |
|---|---|---|
| `starting` | `light` | `steady` only |
| `building` | `steady` | `light` or `pushing` |
| `leveling` | `steady` | `pushing` only |
| `all-in` | `pushing` | `steady` only |

### Completion threshold calculation
```
expectedCheckIns = durationWeeks × daysPerWeekMid × associatedMarkCount
unlockThreshold  = Math.floor(expectedCheckIns × 0.80)
```
Where `daysPerWeekMid` = Light: 2.5, Steady: 4.5, Pushing: 5.5

The "Complete" button is locked until the user's total check-ins across all associated marks reaches `unlockThreshold`. After that it unlocks — no automatic completion, user still taps it manually.

### Explanation button copy
- **Tier explanation:** *"Life gets in the way. That's not failure — that's just Tuesday. Keep going anyway."*
- **Frequency explanation:** *"Rest days aren't days off. They're when the work actually sticks."*

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/suggestedCounters.ts` | Modify | Add `tags`, `id`, `weeklyFrequency` fields; add `writing`, `language`, `meal-prep` marks |
| `lib/goalMarkSuggestions.ts` | Create | Pure functions: `getMarksForGoal`, `calculateThreshold` |
| `tests/unit/goalMarkSuggestions.test.ts` | Create | Unit tests for suggestion + threshold logic |
| `types/goal.ts` | Modify | Add `associated_mark_ids`, `tier`, `frequency`, `unlock_threshold`, `total_check_ins` |
| `lib/db/goalsDb.ts` | Modify | Normalize new fields on read |
| `state/goalsSlice.ts` | Modify | Pass new fields through `addGoal`; add `incrementCheckIns` action |
| `components/CommitmentScreen.tsx` | Create | Reusable marks + tier + frequency screen used in both goal creation and onboarding |
| `app/goal/new.tsx` | Modify | Two-step flow: title → CommitmentScreen |
| `app/goal/queue.tsx` | Modify | Show mark chips on goal cards; gated Complete button with progress indicator |
| `app/counter/[id].tsx` | Modify | "Goals using this mark" section |
| `app/onboarding/index.tsx` | Modify | Restructure to goal-first flow using CommitmentScreen |

---

## Task 1: Expand mark library

**File:** `lib/suggestedCounters.ts`

### Step 1.1 — Read the full file first
Understand the existing shape before touching anything.

### Step 1.2 — Update `SuggestedMark` type

```typescript
export type SuggestedMark = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
  tags: string[];
  weeklyFrequency: number; // default check-ins per week this mark contributes to a goal
};
```

### Step 1.3 — Replace marks array with full tagged library

```typescript
export const SUGGESTED_MARKS_BY_CATEGORY: MarkCategory[] = [
  {
    title: 'Recovery',
    emoji: '🌙',
    marks: [
      { id: 'sleep', name: 'Sleep', emoji: '🌙', color: '#6366F1', unit: 'days', weeklyFrequency: 7,
        tags: ['sleep', 'recovery', 'energy', 'marathon', 'performance', 'insomnia', 'rest', 'fatigue', 'tired', 'endurance', 'health', 'athlete'] },
      { id: 'stretch', name: 'Stretch', emoji: '🧘', color: '#8B5CF6', unit: 'sessions', weeklyFrequency: 4,
        tags: ['flexibility', 'mobility', 'recovery', 'injury', 'yoga', 'marathon', 'run', 'athlete', 'posture', 'soreness', 'tightness'] },
      { id: 'rest', name: 'Rest Day', emoji: '😴', color: '#A78BFA', unit: 'days', weeklyFrequency: 2,
        tags: ['recovery', 'overtraining', 'burnout', 'athlete', 'marathon', 'fatigue', 'rest', 'balance'] },
    ],
  },
  {
    title: 'Fitness',
    emoji: '💪',
    marks: [
      { id: 'workout', name: 'Workout', emoji: '🏋️', color: '#F97316', unit: 'sessions', weeklyFrequency: 4,
        tags: ['fitness', 'strength', 'muscle', 'gym', 'marathon', 'lose weight', 'bulk', 'tone', 'training', 'athlete', 'body', 'health', 'endurance', 'triathlon'] },
      { id: 'steps', name: 'Steps', emoji: '👣', color: '#10B981', unit: 'items', weeklyFrequency: 5,
        tags: ['steps', 'walk', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'active', 'movement', 'walking', 'running', 'weight loss'] },
      { id: 'run', name: 'Run', emoji: '🏃', color: '#EF4444', unit: 'sessions', weeklyFrequency: 3,
        tags: ['running', 'marathon', '5k', '10k', 'half marathon', 'race', 'cardio', 'jogging', 'endurance', 'triathlon', 'speed', 'pace'] },
      { id: 'swim', name: 'Swim', emoji: '🏊', color: '#06B6D4', unit: 'sessions', weeklyFrequency: 3,
        tags: ['swimming', 'triathlon', 'endurance', 'cardio', 'marathon', 'weight loss', 'low impact', 'fitness', 'athlete', 'laps'] },
      { id: 'cycling', name: 'Cycling', emoji: '🚴', color: '#F59E0B', unit: 'sessions', weeklyFrequency: 3,
        tags: ['cycling', 'bike', 'triathlon', 'cardio', 'endurance', 'weight loss', 'commute', 'fitness', 'spin', 'race'] },
    ],
  },
  {
    title: 'Health',
    emoji: '💧',
    marks: [
      { id: 'water', name: 'Water', emoji: '💧', color: '#06B6D4', unit: 'items', weeklyFrequency: 7,
        tags: ['hydration', 'water', 'health', 'weight loss', 'energy', 'skin', 'detox', 'marathon', 'performance', 'kidney'] },
      { id: 'nutrition', name: 'Nutrition', emoji: '🥗', color: '#10B981', unit: 'days', weeklyFrequency: 6,
        tags: ['diet', 'eat clean', 'nutrition', 'weight loss', 'meal prep', 'health', 'muscle', 'performance', 'food', 'body'] },
      { id: 'vitamins', name: 'Vitamins', emoji: '💊', color: '#F97316', unit: 'days', weeklyFrequency: 7,
        tags: ['vitamins', 'supplements', 'health', 'immunity', 'wellness', 'energy', 'nutrition', 'deficiency'] },
      { id: 'calories', name: 'Calories', emoji: '🔥', color: '#EF4444', unit: 'items', weeklyFrequency: 7,
        tags: ['calories', 'weight loss', 'diet', 'cut', 'bulk', 'nutrition', 'food', 'macro', 'fitness', 'body composition'] },
      { id: 'no-alcohol', name: 'No Alcohol', emoji: '🚫', color: '#6B7280', unit: 'days', weeklyFrequency: 7,
        tags: ['sober', 'sobriety', 'dry january', 'alcohol', 'drinking', 'liver', 'health', 'sleep', 'discipline', 'addiction', 'quit'] },
      { id: 'meal-prep', name: 'Meal Prep', emoji: '🍱', color: '#84CC16', unit: 'sessions', weeklyFrequency: 2,
        tags: ['meal prep', 'diet', 'nutrition', 'weight loss', 'cooking', 'food', 'healthy eating', 'discipline', 'budget', 'prep'] },
    ],
  },
  {
    title: 'Mindset',
    emoji: '🧠',
    marks: [
      { id: 'meditation', name: 'Meditation', emoji: '🧠', color: '#8B5CF6', unit: 'sessions', weeklyFrequency: 5,
        tags: ['meditation', 'stress', 'anxiety', 'focus', 'mindfulness', 'mental health', 'calm', 'clarity', 'sleep', 'peace', 'breath'] },
      { id: 'journaling', name: 'Journaling', emoji: '📓', color: '#D97706', unit: 'sessions', weeklyFrequency: 4,
        tags: ['journaling', 'reflection', 'gratitude', 'clarity', 'mental health', 'anxiety', 'writing', 'self awareness', 'growth', 'therapy'] },
      { id: 'gratitude', name: 'Gratitude', emoji: '🙏', color: '#EC4899', unit: 'sessions', weeklyFrequency: 5,
        tags: ['gratitude', 'positivity', 'mindset', 'happiness', 'mental health', 'relationships', 'wellbeing', 'perspective'] },
      { id: 'breathwork', name: 'Breathwork', emoji: '💨', color: '#06B6D4', unit: 'sessions', weeklyFrequency: 4,
        tags: ['breathwork', 'anxiety', 'stress', 'panic', 'calm', 'focus', 'meditation', 'energy', 'performance', 'sleep'] },
      { id: 'affirmations', name: 'Affirmations', emoji: '💬', color: '#A855F7', unit: 'sessions', weeklyFrequency: 5,
        tags: ['affirmations', 'confidence', 'mindset', 'self esteem', 'positivity', 'motivation', 'identity', 'belief'] },
    ],
  },
  {
    title: 'Deep Work',
    emoji: '🎯',
    marks: [
      { id: 'focus', name: 'Focus', emoji: '🎯', color: '#F97316', unit: 'sessions', weeklyFrequency: 5,
        tags: ['focus', 'productivity', 'deep work', 'distraction', 'adhd', 'career', 'study', 'startup', 'business', 'writing', 'coding'] },
      { id: 'planning', name: 'Planning', emoji: '🗓️', color: '#6366F1', unit: 'sessions', weeklyFrequency: 3,
        tags: ['planning', 'organization', 'productivity', 'career', 'business', 'goals', 'schedule', 'time management', 'project'] },
      { id: 'reading', name: 'Reading', emoji: '📖', color: '#10B981', unit: 'sessions', weeklyFrequency: 4,
        tags: ['reading', 'books', 'learning', 'knowledge', 'growth', 'education', 'career', 'skill', 'vocabulary', 'writing'] },
      { id: 'practice', name: 'Practice', emoji: '⚡', color: '#EAB308', unit: 'sessions', weeklyFrequency: 5,
        tags: ['practice', 'skill', 'instrument', 'music', 'coding', 'language', 'art', 'sport', 'mastery', 'daily', 'discipline'] },
      { id: 'study', name: 'Study', emoji: '🎓', color: '#3B82F6', unit: 'sessions', weeklyFrequency: 4,
        tags: ['study', 'exam', 'school', 'degree', 'certification', 'course', 'learning', 'knowledge', 'career', 'skill'] },
      { id: 'deep-work', name: 'Deep Work', emoji: '⏳', color: '#1D4ED8', unit: 'sessions', weeklyFrequency: 4,
        tags: ['deep work', 'focus', 'productivity', 'distraction', 'startup', 'career', 'writing', 'coding', 'flow state', 'output'] },
      { id: 'no-phone', name: 'No Phone', emoji: '📵', color: '#6B7280', unit: 'days', weeklyFrequency: 5,
        tags: ['phone', 'screen time', 'distraction', 'focus', 'productivity', 'social media', 'addiction', 'dopamine', 'presence'] },
      { id: 'writing', name: 'Writing', emoji: '✍️', color: '#7C3AED', unit: 'sessions', weeklyFrequency: 4,
        tags: ['writing', 'book', 'blog', 'content', 'author', 'copywriting', 'journal', 'script', 'storytelling', 'career', 'side hustle', 'novel'] },
      { id: 'language', name: 'Language', emoji: '🗣️', color: '#059669', unit: 'sessions', weeklyFrequency: 5,
        tags: ['language', 'spanish', 'french', 'japanese', 'fluent', 'bilingual', 'travel', 'culture', 'learning', 'skill', 'korean', 'italian', 'portuguese'] },
    ],
  },
  {
    title: 'Finance',
    emoji: '💳',
    marks: [
      { id: 'finance', name: 'Finance', emoji: '💳', color: '#10B981', unit: 'days', weeklyFrequency: 5,
        tags: ['finance', 'budget', 'money', 'spending', 'debt', 'financial freedom', 'wealth', 'income', 'bills'] },
      { id: 'saving', name: 'Saving', emoji: '🐷', color: '#F43F5E', unit: 'days', weeklyFrequency: 5,
        tags: ['saving', 'savings', 'emergency fund', 'down payment', 'house', 'financial freedom', 'retirement', 'debt', 'wealth'] },
      { id: 'no-spend', name: 'No Spend', emoji: '💸', color: '#6B7280', unit: 'days', weeklyFrequency: 5,
        tags: ['no spend', 'spending', 'budget', 'frugal', 'debt', 'savings', 'discipline', 'impulse', 'financial freedom'] },
      { id: 'invest', name: 'Invest', emoji: '📈', color: '#10B981', unit: 'days', weeklyFrequency: 3,
        tags: ['investing', 'investment', 'stocks', 'wealth', 'retirement', 'financial freedom', 'compound interest', 'passive income'] },
      { id: 'side-hustle', name: 'Side Hustle', emoji: '💼', color: '#F97316', unit: 'sessions', weeklyFrequency: 4,
        tags: ['side hustle', 'income', 'business', 'freelance', 'startup', 'money', 'entrepreneur', 'revenue', 'clients'] },
    ],
  },
  {
    title: 'Discipline',
    emoji: '🌅',
    marks: [
      { id: 'cold-shower', name: 'Cold Shower', emoji: '🚿', color: '#06B6D4', unit: 'days', weeklyFrequency: 5,
        tags: ['cold shower', 'discipline', 'energy', 'immune', 'willpower', 'mental toughness', 'habit', 'morning', 'recovery'] },
      { id: 'wake-early', name: 'Wake Early', emoji: '🌅', color: '#F59E0B', unit: 'days', weeklyFrequency: 6,
        tags: ['wake early', 'morning routine', '5am', 'discipline', 'productivity', 'sleep schedule', 'routine', 'schedule'] },
      { id: 'no-sugar', name: 'No Sugar', emoji: '🚫', color: '#EF4444', unit: 'days', weeklyFrequency: 7,
        tags: ['no sugar', 'diet', 'weight loss', 'diabetes', 'health', 'discipline', 'nutrition', 'clean eating', 'inflammation'] },
      { id: 'screen-time', name: 'Screen Time', emoji: '📱', color: '#6366F1', unit: 'days', weeklyFrequency: 5,
        tags: ['screen time', 'phone', 'social media', 'distraction', 'sleep', 'focus', 'addiction', 'productivity', 'presence'] },
      { id: 'cooking', name: 'Cooking', emoji: '🍳', color: '#F97316', unit: 'sessions', weeklyFrequency: 4,
        tags: ['cooking', 'meal prep', 'nutrition', 'diet', 'health', 'money', 'food', 'eating out', 'skills', 'discipline'] },
      { id: 'posture', name: 'Posture', emoji: '🧍', color: '#8B5CF6', unit: 'days', weeklyFrequency: 5,
        tags: ['posture', 'back pain', 'ergonomics', 'health', 'desk', 'alignment', 'neck', 'spine', 'sitting'] },
    ],
  },
  {
    title: 'Relationships',
    emoji: '👥',
    marks: [
      { id: 'socialize', name: 'Socialize', emoji: '👥', color: '#EC4899', unit: 'sessions', weeklyFrequency: 3,
        tags: ['social', 'friends', 'loneliness', 'connection', 'mental health', 'relationships', 'network', 'community'] },
      { id: 'family', name: 'Family Time', emoji: '🏠', color: '#F59E0B', unit: 'sessions', weeklyFrequency: 4,
        tags: ['family', 'kids', 'marriage', 'partner', 'parents', 'relationships', 'presence', 'work life balance', 'connection'] },
      { id: 'networking', name: 'Networking', emoji: '🤝', color: '#3B82F6', unit: 'sessions', weeklyFrequency: 2,
        tags: ['networking', 'career', 'business', 'connections', 'job', 'clients', 'professional', 'relationships', 'growth'] },
      { id: 'volunteer', name: 'Volunteer', emoji: '❤️', color: '#EF4444', unit: 'sessions', weeklyFrequency: 2,
        tags: ['volunteer', 'community', 'purpose', 'giving', 'social', 'relationships', 'fulfilment', 'impact', 'charity'] },
    ],
  },
  {
    title: 'Creative',
    emoji: '🎨',
    marks: [
      { id: 'creative', name: 'Creative', emoji: '🎨', color: '#A855F7', unit: 'sessions', weeklyFrequency: 4,
        tags: ['creative', 'art', 'drawing', 'painting', 'design', 'music', 'writing', 'expression', 'hobby', 'skill', 'side hustle'] },
    ],
  },
];
```

### Step 1.4 — Preserve backwards compat exports

```typescript
export const ALL_SUGGESTED_MARKS: SuggestedMark[] = SUGGESTED_MARKS_BY_CATEGORY.flatMap(c => c.marks);
export const MARK_LIBRARY_BY_ID: Record<string, SuggestedMark> = Object.fromEntries(
  ALL_SUGGESTED_MARKS.map(m => [m.id, m])
);
export type SuggestedCounter = SuggestedMark;
export const SUGGESTED_COUNTERS_BY_CATEGORY = SUGGESTED_MARKS_BY_CATEGORY.map(c => ({ ...c, counters: c.marks }));
export const ALL_SUGGESTED_COUNTERS: SuggestedCounter[] = ALL_SUGGESTED_MARKS;
```

### Step 1.5 — Validate

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

### Step 1.6 — Commit

```bash
git add lib/suggestedCounters.ts
git commit -m "feat(marks): add tags, id, weeklyFrequency to MARK_LIBRARY; add writing, language, meal-prep"
```

---

## Task 2: Suggestion engine + commitment types

**Files:** `lib/goalMarkSuggestions.ts`, `tests/unit/goalMarkSuggestions.test.ts`, `types/goal.ts`, `lib/db/goalsDb.ts`

### Step 2.1 — Create `lib/goalMarkSuggestions.ts`

```typescript
import { ALL_SUGGESTED_MARKS, SuggestedMark } from './suggestedCounters';

// ─── Constants ───────────────────────────────────────────────────────────────

export type TierId = 'starting' | 'building' | 'leveling' | 'all-in';
export type FrequencyId = 'light' | 'steady' | 'pushing';

export const TIERS: Record<TierId, { label: string; durationWeeks: number; description: string; defaultFrequency: FrequencyId; allowedFrequencies: FrequencyId[] }> = {
  'starting':  { label: 'Just starting',         durationWeeks: 6,  description: 'First attempt, building the habit',      defaultFrequency: 'light',  allowedFrequencies: ['light', 'steady'] },
  'building':  { label: 'Building consistency',  durationWeeks: 10, description: 'Some experience, making it stick',       defaultFrequency: 'steady', allowedFrequencies: ['light', 'steady', 'pushing'] },
  'leveling':  { label: 'Leveling up',           durationWeeks: 16, description: 'Comfortable, pushing further',           defaultFrequency: 'steady', allowedFrequencies: ['steady', 'pushing'] },
  'all-in':    { label: 'All in',                durationWeeks: 24, description: 'High commitment, serious outcome',       defaultFrequency: 'pushing', allowedFrequencies: ['steady', 'pushing'] },
};

export const FREQUENCIES: Record<FrequencyId, { label: string; daysPerWeekMid: number; range: string; restDays: string }> = {
  'light':   { label: 'Light',         daysPerWeekMid: 2.5, range: '2–3 days/week', restDays: '4–5 rest days' },
  'steady':  { label: 'Steady',        daysPerWeekMid: 4.5, range: '4–5 days/week', restDays: '2–3 rest days' },
  'pushing': { label: 'Pushing past',  daysPerWeekMid: 5.5, range: '5–6 days/week', restDays: '1–2 rest days' },
};

const MAX_SUGGESTIONS = 5;
const COMPLETION_THRESHOLD_RATE = 0.80;

const FALLBACK_MARK_IDS = ['workout', 'focus', 'planning', 'sleep', 'water'];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in',
  'on', 'at', 'by', 'my', 'i', 'want', 'become', 'be', 'get', 'do',
  'build', 'start', 'make', 'learn', 'improve', 'better', 'more',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function scoreMark(mark: SuggestedMark, tokens: string[]): number {
  let score = 0;
  const lowerTags = mark.tags.map(t => t.toLowerCase());
  for (const token of tokens) {
    for (const tag of lowerTags) {
      if (tag === token) score += 2;
      else if (tag.includes(token) || token.includes(tag)) score += 1;
    }
  }
  return score;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Returns up to 5 marks most relevant to the given goal title.
 * Falls back to general marks if no matches found.
 */
export function getMarksForGoal(goalTitle: string): SuggestedMark[] {
  const tokens = tokenize(goalTitle);
  if (tokens.length === 0) {
    return FALLBACK_MARK_IDS
      .map(id => ALL_SUGGESTED_MARKS.find(m => m.id === id))
      .filter(Boolean) as SuggestedMark[];
  }

  const scored = ALL_SUGGESTED_MARKS
    .map(mark => ({ mark, score: scoreMark(mark, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ mark }) => mark);

  if (scored.length > 0) return scored;

  return FALLBACK_MARK_IDS
    .map(id => ALL_SUGGESTED_MARKS.find(m => m.id === id))
    .filter(Boolean) as SuggestedMark[];
}

/**
 * Calculates the minimum check-in count required to unlock goal completion.
 * Based on tier duration, frequency, and number of associated marks.
 */
export function calculateUnlockThreshold(
  tier: TierId,
  frequency: FrequencyId,
  associatedMarkCount: number,
): number {
  const { durationWeeks } = TIERS[tier];
  const { daysPerWeekMid } = FREQUENCIES[frequency];
  const expected = durationWeeks * daysPerWeekMid * associatedMarkCount;
  return Math.floor(expected * COMPLETION_THRESHOLD_RATE);
}

/**
 * Returns a human-readable summary of the commitment.
 * Example: "~180 check-ins over 16 weeks"
 */
export function commitmentSummary(
  tier: TierId,
  frequency: FrequencyId,
  associatedMarkCount: number,
): string {
  const threshold = calculateUnlockThreshold(tier, frequency, associatedMarkCount);
  const weeks = TIERS[tier].durationWeeks;
  return `~${threshold} check-ins over ${weeks} weeks`;
}
```

### Step 2.2 — Create `tests/unit/goalMarkSuggestions.test.ts`

```typescript
import { getMarksForGoal, calculateUnlockThreshold, TIERS, FREQUENCIES } from '../../lib/goalMarkSuggestions';

describe('getMarksForGoal', () => {
  it('returns run and steps for "Run a marathon"', () => {
    const ids = getMarksForGoal('Run a marathon').map(m => m.id);
    expect(ids).toContain('run');
    expect(ids).toContain('steps');
  });

  it('returns saving for "Save for a house"', () => {
    const ids = getMarksForGoal('Save for a house').map(m => m.id);
    expect(ids).toContain('saving');
  });

  it('returns language for "Learn Spanish"', () => {
    const ids = getMarksForGoal('Learn Spanish').map(m => m.id);
    expect(ids).toContain('language');
  });

  it('returns writing for "Write a book"', () => {
    const ids = getMarksForGoal('Write a book').map(m => m.id);
    expect(ids).toContain('writing');
  });

  it('returns invest for "Build passive income"', () => {
    const ids = getMarksForGoal('Build passive income').map(m => m.id);
    expect(ids).toContain('invest');
  });

  it('returns no more than 5 marks', () => {
    expect(getMarksForGoal('Run marathon lose weight sleep better eat clean focus').length).toBeLessThanOrEqual(5);
  });

  it('returns fallback marks for empty title', () => {
    expect(getMarksForGoal('').length).toBeGreaterThan(0);
  });
});

describe('calculateUnlockThreshold', () => {
  it('scales with mark count', () => {
    const one = calculateUnlockThreshold('building', 'steady', 1);
    const three = calculateUnlockThreshold('building', 'steady', 3);
    expect(three).toBeGreaterThan(one);
  });

  it('all-in pushing produces highest threshold', () => {
    const high = calculateUnlockThreshold('all-in', 'pushing', 3);
    const low = calculateUnlockThreshold('starting', 'light', 3);
    expect(high).toBeGreaterThan(low);
  });

  it('returns a positive integer', () => {
    const result = calculateUnlockThreshold('leveling', 'steady', 2);
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});
```

### Step 2.3 — Update `types/goal.ts`

Add new fields to `Goal`:

```typescript
import { TierId, FrequencyId } from '../lib/goalMarkSuggestions';

export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  target_date?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  associated_mark_ids: string[];   // mark DB IDs linked at goal creation
  tier: TierId;                    // commitment tier
  frequency: FrequencyId;          // selected frequency
  unlock_threshold: number;        // min check-ins to unlock Complete button
  total_check_ins: number;         // running total of check-ins across associated marks
};
```

### Step 2.4 — Update `lib/db/goalsDb.ts`

Normalize missing fields on read for goals created before this feature:

```typescript
export async function loadGoalsForUser(userId: string): Promise<Goal[]> {
  const all = await readAll();
  return all
    .filter(g => g.user_id === userId)
    .map(g => ({
      ...g,
      associated_mark_ids: g.associated_mark_ids ?? [],
      tier: g.tier ?? 'building',
      frequency: g.frequency ?? 'steady',
      unlock_threshold: g.unlock_threshold ?? 0,
      total_check_ins: g.total_check_ins ?? 0,
    }));
}
```

### Step 2.5 — Validate + commit

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

```bash
git add lib/goalMarkSuggestions.ts tests/unit/goalMarkSuggestions.test.ts types/goal.ts lib/db/goalsDb.ts
git commit -m "feat(goals): suggestion engine, commitment types, threshold calculation"
```

---

## Task 3: CommitmentScreen component

**File:** `components/CommitmentScreen.tsx`

This is the shared screen used in both goal creation and onboarding. It renders marks + tier + frequency in one collapsed view.

### Step 3.1 — Create `components/CommitmentScreen.tsx`

```typescript
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import {
  SuggestedMark,
  TierId, FrequencyId,
  TIERS, FREQUENCIES,
  calculateUnlockThreshold,
  commitmentSummary,
} from '../lib/goalMarkSuggestions';
import { Mark } from '../types';
import { MARK_LIBRARY_BY_ID } from '../lib/suggestedCounters';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommitmentSelection = {
  selectedNewMarkIds: string[];       // IDs from suggested marks NOT already owned
  alreadyOwnedMarkIds: string[];      // IDs of user's existing marks that match suggestions
  tier: TierId;
  frequency: FrequencyId;
  unlockThreshold: number;
};

type Props = {
  goalTitle: string;
  suggestedMarks: SuggestedMark[];
  userMarks: Mark[];
  onConfirm: (selection: CommitmentSelection) => void;
  onBack: () => void;
  /** Pass true in onboarding to show slightly more descriptive labels */
  isOnboarding?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findOwnedMark(suggested: SuggestedMark, userMarks: Mark[]): Mark | undefined {
  return userMarks.find(
    m => m.name.toLowerCase() === suggested.name.toLowerCase() || m.icon === suggested.id
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommitmentScreen({
  goalTitle, suggestedMarks, userMarks, onConfirm, onBack, isOnboarding = false,
}: Props) {
  const theme = useEffectiveTheme();
  const tc = colors[theme];
  const router = useRouter();

  // Marks
  const [selectedNewIds, setSelectedNewIds] = useState<Set<string>>(
    () => new Set(suggestedMarks.filter(s => !findOwnedMark(s, userMarks)).map(s => s.id))
  );

  // Tier + frequency
  const [tier, setTier] = useState<TierId>('building');
  const [frequency, setFrequency] = useState<FrequencyId>(TIERS['building'].defaultFrequency);

  // Explanation modal
  const [explanationVisible, setExplanationVisible] = useState<'tier' | 'frequency' | null>(null);

  const handleTierSelect = (t: TierId) => {
    setTier(t);
    setFrequency(TIERS[t].defaultFrequency); // reset to default on tier change
  };

  const handleFrequencySelect = (f: FrequencyId) => {
    if (TIERS[tier].allowedFrequencies.includes(f)) setFrequency(f);
  };

  const toggleMark = (id: string, owned: boolean) => {
    if (owned) {
      // owned marks are tappable → navigate to mark detail
      const mark = userMarks.find(m => m.icon === id || m.name.toLowerCase() === MARK_LIBRARY_BY_ID[id]?.name.toLowerCase());
      if (mark) router.push(`/counter/${mark.id}`);
      return;
    }
    setSelectedNewIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const alreadyOwnedMarkIds = suggestedMarks
      .map(s => findOwnedMark(s, userMarks))
      .filter(Boolean)
      .map(m => m!.id);

    const totalAssociated = alreadyOwnedMarkIds.length + selectedNewIds.size;
    const unlockThreshold = calculateUnlockThreshold(tier, frequency, totalAssociated);

    onConfirm({
      selectedNewMarkIds: Array.from(selectedNewIds),
      alreadyOwnedMarkIds,
      tier,
      frequency,
      unlockThreshold,
    });
  };

  const totalSelected = suggestedMarks.filter(s => {
    const owned = findOwnedMark(s, userMarks);
    return owned ? true : selectedNewIds.has(s.id);
  }).length;

  const summary = commitmentSummary(tier, frequency, totalSelected);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tc.background }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={[styles.backText, { color: tc.textSecondary }]}>← Back</Text>
      </TouchableOpacity>

      <Text style={[styles.heading, { color: tc.text }]}>
        {isOnboarding ? 'What does this take?' : 'Your commitment'}
      </Text>
      {isOnboarding && (
        <Text style={[styles.subheading, { color: tc.textSecondary }]}>
          These are the daily actions that build toward your goal. You can adjust anytime.
        </Text>
      )}

      {/* ── Marks ── */}
      <Text style={[styles.sectionLabel, { color: tc.textSecondary }]}>MARKS</Text>
      <View style={styles.markRow}>
        {suggestedMarks.map(s => {
          const owned = findOwnedMark(s, userMarks);
          const isSelected = owned ? true : selectedNewIds.has(s.id);
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => toggleMark(s.id, !!owned)}
              style={[
                styles.markChip,
                {
                  borderColor: isSelected ? s.color : tc.border,
                  backgroundColor: isSelected ? s.color + '18' : tc.surface,
                },
              ]}
            >
              <Text style={{ fontSize: 16 }}>{s.emoji}</Text>
              <Text style={[styles.markName, { color: isSelected ? tc.text : tc.textSecondary }]}>
                {s.name}
              </Text>
              {owned && (
                <Text style={[styles.ownedBadge, { color: tc.textSecondary }]}>✓</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tier ── */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: tc.textSecondary }]}>COMMITMENT LEVEL</Text>
        <TouchableOpacity onPress={() => setExplanationVisible('tier')}>
          <Text style={[styles.explainBtn, { color: tc.textSecondary, borderColor: tc.border }]}>
            ?
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tierRow}>
        {(Object.keys(TIERS) as TierId[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => handleTierSelect(t)}
            style={[
              styles.tierBtn,
              {
                borderColor: tier === t ? tc.accent : tc.border,
                backgroundColor: tier === t ? tc.accent + '15' : tc.surface,
              },
            ]}
          >
            <Text style={[styles.tierLabel, { color: tier === t ? tc.text : tc.textSecondary }]}>
              {TIERS[t].label}
            </Text>
            {isOnboarding && (
              <Text style={[styles.tierDesc, { color: tc.textSecondary }]}>
                {TIERS[t].description}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Frequency ── */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: tc.textSecondary }]}>FREQUENCY</Text>
        <TouchableOpacity onPress={() => setExplanationVisible('frequency')}>
          <Text style={[styles.explainBtn, { color: tc.textSecondary, borderColor: tc.border }]}>
            ?
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.freqRow}>
        {(Object.keys(FREQUENCIES) as FrequencyId[]).map(f => {
          const allowed = TIERS[tier].allowedFrequencies.includes(f);
          const selected = frequency === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => handleFrequencySelect(f)}
              disabled={!allowed}
              style={[
                styles.freqBtn,
                {
                  borderColor: selected ? tc.accent : tc.border,
                  backgroundColor: selected ? tc.accent + '15' : tc.surface,
                  opacity: allowed ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.freqLabel, { color: selected ? tc.text : tc.textSecondary }]}>
                {FREQUENCIES[f].label}
              </Text>
              <Text style={[styles.freqRange, { color: tc.textSecondary }]}>
                {FREQUENCIES[f].range}
              </Text>
              <Text style={[styles.freqRest, { color: tc.textSecondary }]}>
                {FREQUENCIES[f].restDays}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Summary ── */}
      {totalSelected > 0 && (
        <Text style={[styles.summary, { color: tc.textSecondary }]}>{summary}</Text>
      )}

      {/* ── CTA ── */}
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: tc.accent }]}
        onPress={handleConfirm}
        disabled={totalSelected === 0}
      >
        <Text style={styles.ctaText}>
          {isOnboarding ? "Let's go" : 'Create goal'}
        </Text>
      </TouchableOpacity>

      {/* ── Explanation Modal ── */}
      <Modal
        visible={explanationVisible !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExplanationVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setExplanationVisible(null)}
        >
          <View style={[styles.modalCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
            <Text style={[styles.modalText, { color: tc.text }]}>
              {explanationVisible === 'tier'
                ? "Life gets in the way. That's not failure — that's just Tuesday. Keep going anyway."
                : "Rest days aren't days off. They're when the work actually sticks."}
            </Text>
            <TouchableOpacity onPress={() => setExplanationVisible(null)}>
              <Text style={[styles.modalClose, { color: tc.textSecondary }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl ?? 48, paddingTop: spacing.sm },
  backBtn: { marginBottom: spacing.md },
  backText: { fontSize: fontSize.sm },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  subheading: { fontSize: fontSize.sm, marginBottom: spacing.lg, lineHeight: 20 },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 1, marginBottom: spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: spacing.lg },
  markRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  markChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.full ?? 999, borderWidth: 1.5 },
  markName: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  ownedBadge: { fontSize: 10, marginLeft: 2 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tierBtn: { flex: 1, minWidth: '45%', borderWidth: 1.5, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center' },
  tierLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textAlign: 'center' },
  tierDesc: { fontSize: 10, textAlign: 'center', marginTop: 2 },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqBtn: { flex: 1, borderWidth: 1.5, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center', gap: 2 },
  freqLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  freqRange: { fontSize: 10 },
  freqRest: { fontSize: 10 },
  summary: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.md },
  cta: { marginTop: spacing.lg, borderRadius: borderRadius.full ?? 999, paddingVertical: spacing.md, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md },
  explainBtn: { fontSize: 11, borderWidth: 1, borderRadius: 10, width: 20, height: 20, textAlign: 'center', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md, maxWidth: 320 },
  modalText: { fontSize: fontSize.md, lineHeight: 24 },
  modalClose: { fontSize: fontSize.sm, textAlign: 'right', fontWeight: fontWeight.medium },
});
```

### Step 3.2 — Validate + commit

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

```bash
git add components/CommitmentScreen.tsx
git commit -m "feat(commitment): add CommitmentScreen component with tier, frequency, mark selection"
```

---

## Task 4: Update goal creation + goals slice

**Files:** `app/goal/new.tsx`, `state/goalsSlice.ts`

### Step 4.1 — Read both files in full before editing

### Step 4.2 — Update `app/goal/new.tsx`

Replace with two-step flow: `'title' | 'commitment'`.

**Step 1 — Title:** Same as current. "Next" button calls `getMarksForGoal(title)`, stores result in state, transitions to step 2.

**Step 2 — CommitmentScreen:** Pass `suggestedMarks`, `userMarks` from `useMarksStore`. On `onConfirm`, call `addGoal` with all fields, then `router.back()`.

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { checkProStatus } from '../../lib/iap/iap';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
import { CommitmentScreen, CommitmentSelection } from '../../components/CommitmentScreen';
import { SuggestedMark } from '../../lib/suggestedCounters';

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const tc = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const addGoal = useGoalsStore(s => s.addGoal);
  const addMark = useMarksStore(s => s.addCounter);
  const marks = useMarksStore(s => s.counters);

  const [step, setStep] = useState<'title' | 'commitment'>('title');
  const [title, setTitle] = useState('');
  const [suggestedMarks, setSuggestedMarks] = useState<SuggestedMark[]>([]);
  const [saving, setSaving] = useState(false);

  const handleNext = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSuggestedMarks(getMarksForGoal(trimmed));
    setStep('commitment');
  };

  const handleConfirm = async (selection: CommitmentSelection) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();

      // Add new marks
      const newMarkIds: string[] = [];
      for (const id of selection.selectedNewMarkIds) {
        const sugg = suggestedMarks.find(s => s.id === id);
        if (!sugg) continue;
        const newMark = await addMark({
          name: sugg.name,
          icon: sugg.id,
          emoji: sugg.emoji,
          color: sugg.color,
          unit: sugg.unit,
          user_id: user.id,
          goal_period: 'daily',
          schedule_type: 'daily',
          daily_target: 1,
        });
        newMarkIds.push(newMark.id);
      }

      await addGoal({
        title: title.trim(),
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
        associated_mark_ids: [...selection.alreadyOwnedMarkIds, ...newMarkIds],
        tier: selection.tier,
        frequency: selection.frequency,
        unlock_threshold: selection.unlockThreshold,
      });

      router.back();
    } catch (err) {
      if (err instanceof GoalLimitError) {
        Alert.alert('Goal limit reached', 'Upgrade to Livra+ for unlimited goals.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]);
      } else {
        Alert.alert('Error', 'Could not save goal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (step === 'commitment') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tc.background }}>
        <CommitmentScreen
          goalTitle={title}
          suggestedMarks={suggestedMarks}
          userMarks={marks}
          onConfirm={handleConfirm}
          onBack={() => setStep('title')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tc.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.container}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: tc.textSecondary }]}>✕</Text>
          </TouchableOpacity>
          <Text style={[styles.heading, { color: tc.text }]}>What's the goal?</Text>
          <TextInput
            style={[styles.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.surface }]}
            placeholder="Run a marathon, save $10k, learn Spanish..."
            placeholderTextColor={tc.textSecondary}
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={handleNext}
          />
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: tc.accent, opacity: title.trim() ? 1 : 0.4 }]}
            onPress={handleNext}
            disabled={!title.trim()}
          >
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
  backBtn: { alignSelf: 'flex-end' },
  backText: { fontSize: fontSize.lg },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  input: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, fontSize: fontSize.md },
  nextBtn: { borderRadius: borderRadius.full ?? 999, paddingVertical: spacing.md, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md },
});
```

### Step 4.3 — Update `state/goalsSlice.ts`

Update `addGoal` params and Goal construction to include all new fields:

```typescript
addGoal: async (params: {
  title: string;
  description?: string;
  userId: string;
  isPro: boolean;
  associated_mark_ids: string[];
  tier: TierId;
  frequency: FrequencyId;
  unlock_threshold: number;
}) => {
  // existing gating logic unchanged...
  const goal: Goal = {
    id: uuidv4(),
    user_id: params.userId,
    title: params.title,
    description: params.description,
    status: hasActive ? 'queued' : 'active',
    sort_index: goals.length,
    associated_mark_ids: params.associated_mark_ids,
    tier: params.tier,
    frequency: params.frequency,
    unlock_threshold: params.unlock_threshold,
    total_check_ins: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await upsertGoal(goal);
  set(state => ({ goals: [...state.goals, goal] }));
},
```

Also add `incrementCheckIns` action to the slice:

```typescript
incrementCheckIns: async (goalId: string) => {
  const goals = get().goals;
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  const updated: Goal = {
    ...goal,
    total_check_ins: (goal.total_check_ins ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  await upsertGoal(updated);
  set(state => ({ goals: state.goals.map(g => g.id === goalId ? updated : g) }));
},
```

### Step 4.4 — Validate + commit

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

```bash
git add app/goal/new.tsx state/goalsSlice.ts
git commit -m "feat(goals): two-step creation with CommitmentScreen; add tier/frequency/threshold to addGoal"
```

---

## Task 5: Queue screen — mark chips + gated Complete button

**File:** `app/goal/queue.tsx`

### Step 5.1 — Read the full file

### Step 5.2 — Add `GoalMarkRow` component inline

```typescript
function GoalMarkRow({ associatedMarkIds }: { associatedMarkIds: string[] }) {
  const tc = colors[useEffectiveTheme()];
  const router = useRouter();
  const marks = useMarksStore(s => s.counters);

  if (!associatedMarkIds?.length) return null;
  const linked = associatedMarkIds.map(id => marks.find(m => m.id === id)).filter(Boolean) as Mark[];
  if (!linked.length) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {linked.map(mark => {
        const lib = MARK_LIBRARY_BY_ID[mark.icon ?? ''];
        return (
          <TouchableOpacity
            key={mark.id}
            onPress={() => router.push(`/counter/${mark.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: tc.border, backgroundColor: tc.surface }}
          >
            <Text style={{ fontSize: 11 }}>{lib?.emoji ?? '📍'}</Text>
            <Text style={{ fontSize: 11, color: tc.textSecondary, fontWeight: '500' }}>{mark.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
```

### Step 5.3 — Add progress indicator + gated Complete button to active goal card

Replace the current `completeBtn` on the active goal card with:

```tsx
{/* Progress toward unlock */}
{active.unlock_threshold > 0 && (
  <View style={{ marginTop: spacing.sm, gap: 4 }}>
    <View style={{ height: 4, borderRadius: 2, backgroundColor: tc.border, overflow: 'hidden' }}>
      <View style={{
        height: '100%',
        borderRadius: 2,
        backgroundColor: tc.accent,
        width: `${Math.min(100, ((active.total_check_ins ?? 0) / active.unlock_threshold) * 100)}%`,
      }} />
    </View>
    <Text style={{ fontSize: 10, color: tc.textSecondary }}>
      {active.total_check_ins ?? 0} / {active.unlock_threshold} check-ins to complete
    </Text>
  </View>
)}

{/* Gated Complete button */}
<TouchableOpacity
  style={[
    styles.completeBtn,
    {
      borderColor: isUnlocked ? tc.primary : tc.border,
      opacity: isUnlocked ? 1 : 0.4,
    },
  ]}
  onPress={() => isUnlocked && handleComplete(active)}
  disabled={!isUnlocked}
>
  <Text style={[styles.completeBtnText, { color: isUnlocked ? tc.primary : tc.textSecondary }]}>
    {isUnlocked ? 'Mark complete' : `${active.unlock_threshold - (active.total_check_ins ?? 0)} more check-ins to unlock`}
  </Text>
</TouchableOpacity>
```

Where `isUnlocked` is derived as:
```typescript
const isUnlocked = (active.unlock_threshold === 0) || ((active.total_check_ins ?? 0) >= active.unlock_threshold);
```

Also add `<GoalMarkRow associatedMarkIds={active.associated_mark_ids} />` after the goal title/description, and same for each queued goal card.

### Step 5.4 — Validate + commit

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

```bash
git add app/goal/queue.tsx
git commit -m "feat(queue): mark chips, progress bar, gated Complete button on goal cards"
```

---

## Task 6: Mark detail — "Goals using this mark"

**File:** `app/counter/[id].tsx`

### Step 6.1 — Read the full file

### Step 6.2 — Add linked goals section

Add after existing streak/history sections, before settings/delete:

```typescript
const goals = useGoalsStore(s => s.goals);
const linkedGoals = goals.filter(
  g => g.associated_mark_ids?.includes(markId) && g.status !== 'completed'
);
```

```tsx
{linkedGoals.length > 0 && (
  <View style={[styles.section, { marginTop: spacing.lg }]}>
    <Text style={[styles.sectionLabel, { color: tc.textSecondary }]}>
      GOALS USING THIS MARK
    </Text>
    <View style={{ gap: 8, marginTop: spacing.sm }}>
      {linkedGoals.map(goal => (
        <TouchableOpacity
          key={goal.id}
          onPress={() => router.push('/goal/queue')}
          style={[styles.goalChip, { backgroundColor: tc.surface, borderColor: tc.border }]}
        >
          <Text style={{ fontSize: fontSize.sm, color: tc.text, fontWeight: fontWeight.medium }} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text style={{ color: tc.textSecondary }}>→</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)}
```

Add to StyleSheet: `goalChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }`

### Step 6.3 — Validate + commit

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test
```

```bash
git add app/counter/[id].tsx
git commit -m "feat(marks): add linked goals section to mark detail screen"
```

---

## Task 7: Onboarding restructure — goal-first flow

**File:** `app/onboarding/index.tsx` (or wherever the onboarding screens live — confirm path before editing)

### Step 7.1 — Read the full onboarding file(s)

Identify current steps and what drives navigation between them.

### Step 7.2 — Remove the "Why are you here" and mark recommendation steps

These are replaced by the goal title + CommitmentScreen flow.

### Step 7.3 — New onboarding step order

```
Step 1: Welcome (unchanged)
Step 2: Name (unchanged)
Step 3: Goal title input — "What's the goal you're after?"
Step 4: CommitmentScreen (isOnboarding=true) — marks + tier + frequency
Step 5: Home screen (onboarding complete)
```

### Step 7.4 — Goal title step (step 3)

```tsx
<View style={styles.stepContainer}>
  <Text style={[styles.stepHeading, { color: tc.text }]}>
    What's the goal you're after?
  </Text>
  <Text style={[styles.stepSubheading, { color: tc.textSecondary }]}>
    Be specific. "Run a marathon" beats "get fit."
  </Text>
  <TextInput
    style={[styles.input, { color: tc.text, borderColor: tc.border, backgroundColor: tc.surface }]}
    placeholder="Run a marathon, save $10k, learn Spanish..."
    placeholderTextColor={tc.textSecondary}
    value={goalTitle}
    onChangeText={setGoalTitle}
    autoFocus
    returnKeyType="next"
    onSubmitEditing={handleGoalTitleNext}
  />
  <TouchableOpacity
    style={[styles.nextBtn, { backgroundColor: tc.accent, opacity: goalTitle.trim() ? 1 : 0.4 }]}
    onPress={handleGoalTitleNext}
    disabled={!goalTitle.trim()}
  >
    <Text style={styles.nextBtnText}>Next →</Text>
  </TouchableOpacity>
</View>
```

### Step 7.5 — CommitmentScreen step (step 4)

```tsx
<CommitmentScreen
  goalTitle={goalTitle}
  suggestedMarks={getMarksForGoal(goalTitle)}
  userMarks={[]}  // no existing marks during onboarding
  onConfirm={handleOnboardingConfirm}
  onBack={() => setOnboardingStep(3)}
  isOnboarding={true}
/>
```

### Step 7.6 — `handleOnboardingConfirm`

On confirm:
1. Create marks for all `selectedNewMarkIds` (same logic as `app/goal/new.tsx`)
2. Call `addGoal` with all commitment fields
3. Mark onboarding complete
4. Navigate to home screen

```typescript
const handleOnboardingConfirm = async (selection: CommitmentSelection) => {
  if (!user?.id) return;
  try {
    const newMarkIds: string[] = [];
    for (const id of selection.selectedNewMarkIds) {
      const sugg = suggestions.find(s => s.id === id);
      if (!sugg) continue;
      const newMark = await addMark({ name: sugg.name, icon: sugg.id, emoji: sugg.emoji, color: sugg.color, unit: sugg.unit, user_id: user.id, goal_period: 'daily', schedule_type: 'daily', daily_target: 1 });
      newMarkIds.push(newMark.id);
    }
    await addGoal({
      title: goalTitle.trim(),
      userId: user.id,
      isPro: false,
      associated_mark_ids: [...selection.alreadyOwnedMarkIds, ...newMarkIds],
      tier: selection.tier,
      frequency: selection.frequency,
      unlock_threshold: selection.unlockThreshold,
    });
    await completeOnboarding(); // existing onboarding completion call
    router.replace('/(tabs)/home');
  } catch (err) {
    console.error('[Onboarding] Goal creation failed:', err);
  }
};
```

### Step 7.7 — Final validation

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check && npm run test && npx expo-doctor
```

All must pass.

### Step 7.8 — Commit

```bash
git add app/onboarding/
git commit -m "feat(onboarding): restructure to goal-first flow with CommitmentScreen"
```

---

## Final Validation Checklist

Before declaring this feature complete:

- [ ] `npm run type-check` — zero errors
- [ ] `npm run test` — all tests pass (including `goalMarkSuggestions.test.ts`)
- [ ] `npx expo-doctor` — no critical issues
- [ ] "Run a marathon" → suggests `run`, `steps`, `workout` in CommitmentScreen
- [ ] "Save money" → suggests `saving`, `no-spend`
- [ ] "Learn Spanish" → suggests `language`, `practice`
- [ ] Tier selection changes default frequency and disables out-of-range options
- [ ] Explanation modal shows correct copy for tier and frequency
- [ ] "Just starting" cannot select `pushing` frequency
- [ ] "All in" cannot select `light` frequency
- [ ] Already-owned marks show ✓ badge and navigate to mark detail on tap
- [ ] Commitment summary updates when tier, frequency, or mark selection changes
- [ ] Goal cards in queue show mark chips
- [ ] Tapping mark chip navigates to mark detail
- [ ] Mark detail shows linked goals section
- [ ] Tapping goal in mark detail navigates to queue screen
- [ ] Complete button is locked until `total_check_ins >= unlock_threshold`
- [ ] Progress bar fills correctly as check-ins accumulate
- [ ] Goals created before this feature (missing new fields) show no crashes — normalized to defaults
- [ ] Onboarding exits to home with active goal and marks already set
- [ ] New Architecture remains disabled