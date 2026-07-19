import { isMarkAllowedForGoal, RESTRICTED_MARKS } from '../../lib/markRelevance';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';

describe('markRelevance', () => {
  it('restricted mark blocked when its domain is absent', () => {
    expect(isMarkAllowedForGoal('cold-shower', new Set(['Finance']))).toBe(false);
  });
  it('restricted mark allowed when its domain is present', () => {
    expect(isMarkAllowedForGoal('cold-shower', new Set(['Discipline']))).toBe(true);
  });
  it('screen-time unlocked by Deep Work OR Discipline', () => {
    expect(isMarkAllowedForGoal('screen-time', new Set(['Deep Work']))).toBe(true);
    expect(isMarkAllowedForGoal('screen-time', new Set(['Fitness']))).toBe(false);
  });
  it('non-restricted mark always allowed', () => {
    expect(isMarkAllowedForGoal('run', new Set(['Finance']))).toBe(true);
  });
  it('getMarksForGoal("start a business") surfaces no restricted marks', () => {
    const ids = getMarksForGoal('I want to start a business').map((m) => m.id);
    for (const r of Object.keys(RESTRICTED_MARKS)) expect(ids).not.toContain(r);
  });
  it('a discipline goal still allows cold-shower to be eligible', () => {
    // sanity: the gate does not block cold-shower for an in-domain goal
    expect(isMarkAllowedForGoal('cold-shower', new Set(['Discipline']))).toBe(true);
  });
});
