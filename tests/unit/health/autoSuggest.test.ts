import { resolveHealthKitType } from '../../../lib/health/autoSuggest';
import { HEALTH_KIT_PERMISSIONS } from '../../../lib/health/healthTypes';
import { MARK_LIBRARY } from '../../../lib/suggestedCounters';

// Founder 2026-08-06: MARK_LIBRARY.healthKitType is the ONLY source of truth
// for which marks are health-able. The regex this module used to be said 6
// types ("Vitality" → hydration); the curated library column says 3. These
// tests pin the narrowing — the refusals matter as much as the matches.
describe('resolveHealthKitType', () => {
  // The curated three.
  test('Sleep → sleep', () => expect(resolveHealthKitType({ name: 'Sleep' })).toBe('sleep'));
  test('Workout → workout', () =>
    expect(resolveHealthKitType({ name: 'Workout' })).toBe('workout'));
  test('Steps → steps', () => expect(resolveHealthKitType({ name: 'Steps' })).toBe('steps'));

  test('matching is case-insensitive and trimmed, like every library lookup', () => {
    expect(resolveHealthKitType({ name: '  sleep ' })).toBe('sleep');
  });

  test('emoji fallback covers AI-created marks with model-authored names', () => {
    expect(resolveHealthKitType({ name: 'Wind-down ritual', emoji: '🌙' })).toBe('sleep');
  });

  // Library marks the old regex would have claimed — now deliberately null.
  test('Water → null (regex said hydration; library says no)', () =>
    expect(resolveHealthKitType({ name: 'Water' })).toBeNull());
  test('Run → null (regex said running; library says no)', () =>
    expect(resolveHealthKitType({ name: 'Run' })).toBeNull());
  test('Meditation → null (regex said mindful; library says no)', () =>
    expect(resolveHealthKitType({ name: 'Meditation' })).toBeNull());

  // Fuzzy name matches the regex used to accept — refused: not library names.
  test('gym session → null (regex matched workout)', () =>
    expect(resolveHealthKitType({ name: 'gym session' })).toBeNull());
  test('Walk 10k steps → null (regex matched steps)', () =>
    expect(resolveHealthKitType({ name: 'Walk 10k steps' })).toBeNull());
  test('Vitality → null (the regex stretch that motivated the narrowing)', () =>
    expect(resolveHealthKitType({ name: 'Vitality' })).toBeNull());

  // Genuinely custom marks.
  test('Deep Work → null', () => expect(resolveHealthKitType({ name: 'Deep Work' })).toBeNull());
  test('Practice → null (the banner used to show here)', () =>
    expect(resolveHealthKitType({ name: 'Practice' })).toBeNull());
  test('empty string → null', () => expect(resolveHealthKitType({ name: '' })).toBeNull());

  test('exactly the curated marks carry a type, and each type has permissions', () => {
    const healthAble = MARK_LIBRARY.filter((m) => m.healthKitType !== null);
    expect(healthAble.map((m) => m.name).sort()).toEqual(['Sleep', 'Steps', 'Workout']);
    for (const m of healthAble) {
      expect(HEALTH_KIT_PERMISSIONS[m.healthKitType!]).toBeDefined();
    }
  });
});
