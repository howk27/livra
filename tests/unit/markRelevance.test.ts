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

// Founder 2026-09-21: "Run a 5K" suggested Swim and Cycling. Both need a pool or
// a bike, so they may only appear when the goal itself names the sport. The
// 2026-08-04 fix was a PROMPT rule on the AI path only; the local scorer was
// never covered, and a prompt is not a guard.
describe('isSportNamedByGoal (equipment sports are opt-in by name)', () => {
  const { isSportNamedByGoal } = require('../../lib/markRelevance');

  it('a running goal never names swim or cycling', () => {
    for (const tokens of [['run', '5k'], ['run', 'first', '5k'], ['run', 'marathon'], ['get', 'fit']]) {
      expect(isSportNamedByGoal('swim', tokens)).toBe(false);
      expect(isSportNamedByGoal('cycling', tokens)).toBe(false);
    }
  });

  it('the sport is allowed when the goal names it, in any common form', () => {
    expect(isSportNamedByGoal('swim', ['swim', 'mile'])).toBe(true);
    expect(isSportNamedByGoal('swim', ['swimming', 'lessons'])).toBe(true);
    expect(isSportNamedByGoal('cycling', ['bike', 'work'])).toBe(true);
    expect(isSportNamedByGoal('cycling', ['cycling', 'century'])).toBe(true);
  });

  it('a triathlon names all three', () => {
    expect(isSportNamedByGoal('swim', ['complete', 'triathlon'])).toBe(true);
    expect(isSportNamedByGoal('cycling', ['complete', 'triathlon'])).toBe(true);
  });

  it('marks with no equipment rule are never blocked', () => {
    expect(isSportNamedByGoal('run', ['save', 'money'])).toBe(true);
    expect(isSportNamedByGoal('sleep', [])).toBe(true);
  });
});
