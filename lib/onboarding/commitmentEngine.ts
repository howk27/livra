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
 *   easing  → top 2 variable marks at frequency_min
 *   steady  → top 2 variable marks at frequency_recommended
 *   push    → top 3 variable marks at frequency_max
 *
 * Fixed/abstinence marks are excluded from selection — they have no variable
 * frequency position and are not surfaced by the onboarding flow.
 */
export function getMarksForCommitment(
  goalTitle: string,
  commitment: CommitmentLevel,
): CommitmentMarkSelection[] {
  const suggestions = getMarksForGoal(goalTitle);
  const variableMarks = suggestions.filter((m) => m.frequencyKind === 'variable');
  const count = commitment === 'push' ? 3 : 2;
  const selected = variableMarks.slice(0, count);

  return selected.map((m) => ({
    mark: m,
    weeklyTarget:
      commitment === 'easing'
        ? (m.frequency_min ?? 1)
        : commitment === 'steady'
        ? (m.frequency_recommended ?? 3)
        : (m.frequency_max ?? 7),
  }));
}
