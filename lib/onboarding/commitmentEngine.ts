import { getMarksForGoal } from '../goalMarkSuggestions';
import type { CommitmentLevel } from '../../state/onboardingSlice';
import type { MarkDefinition } from '../suggestedCounters';

export type CommitmentMarkSelection = {
  mark: MarkDefinition;
  weeklyTarget: number;
};

/**
 * Given a goal text and a commitment level, returns the initial mark set to
 * present on the onboarding Marks screen.
 *
 * Mapping (locked):
 *   easing  → top 2 marks at frequency_min
 *   steady  → top 2 marks at frequency_recommended
 *   push    → top 3 marks at frequency_max
 *
 * EVERY-DAY MARKS ARE INCLUDED, AT 7, WHATEVER THE COMMITMENT. This used to
 * filter to `frequencyKind === 'variable'` and drop the rest, on the reasoning
 * that a fixed mark "has no variable frequency position". That reasoning
 * answers the wrong question: the position is what target to assign, and for a
 * fixed mark the answer is simply 7 — which is exactly what
 * markFrequencyPreset() has always returned for them. Excluding them was never
 * about the cadence; it was a leftover from when this only knew how to read a
 * range.
 *
 * The cost was invisible until the library grew: Sleep has always been fixed
 * and Water became fixed in 59fb080, so onboarding quietly could not suggest
 * either. Making Nutrition, Calories, Cut Caffeine and Screen Time every-day
 * would have taken four more with them — including the two most on-point marks
 * for a weight-loss goal, the single most common thing people type in. Found by
 * walking the real onboarding flow in the web viewer and noticing that
 * "Lose 15 pounds" came back with Meal Prep and Workout and nothing about food.
 *
 * An every-day mark still costs one of the 2/2/3 slots: it is a real commitment,
 * arguably the realest, and hiding it to keep the slots for negotiable ones
 * would understate what the user just signed up for.
 */
export function getMarksForCommitment(
  goalTitle: string,
  commitment: CommitmentLevel,
): CommitmentMarkSelection[] {
  const suggestions = getMarksForGoal(goalTitle);
  const count = commitment === 'push' ? 3 : 2;
  const selected = suggestions.slice(0, count);

  return selected.map((m) => ({
    mark: m,
    weeklyTarget:
      m.frequencyKind !== 'variable'
        ? 7
        : commitment === 'easing'
        ? (m.frequency_min ?? 1)
        : commitment === 'steady'
        ? (m.frequency_recommended ?? 3)
        : (m.frequency_max ?? 7),
  }));
}
