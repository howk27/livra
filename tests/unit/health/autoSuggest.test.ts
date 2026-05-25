import { detectHealthKitType } from '../../../lib/health/autoSuggest';

describe('detectHealthKitType', () => {
  // Sleep / Recovery
  test('sleep → sleep', () => expect(detectHealthKitType('sleep')).toBe('sleep'));
  test('Recovery → sleep', () => expect(detectHealthKitType('Recovery')).toBe('sleep'));
  test('Morning Sleep → sleep', () => expect(detectHealthKitType('Morning Sleep')).toBe('sleep'));

  // Workout
  test('Workout → workout', () => expect(detectHealthKitType('Workout')).toBe('workout'));
  test('exercise → workout', () => expect(detectHealthKitType('exercise')).toBe('workout'));
  test('Strength Training → workout', () => expect(detectHealthKitType('Strength Training')).toBe('workout'));
  test('gym session → workout', () => expect(detectHealthKitType('gym session')).toBe('workout'));

  // Running (before workout so running wins over workout)
  test('running → running', () => expect(detectHealthKitType('running')).toBe('running'));
  test('Morning Run → running', () => expect(detectHealthKitType('Morning Run')).toBe('running'));

  // Hydration
  test('hydration → hydration', () => expect(detectHealthKitType('hydration')).toBe('hydration'));
  test('water → hydration', () => expect(detectHealthKitType('water')).toBe('hydration'));
  test('Vitality → hydration', () => expect(detectHealthKitType('Vitality')).toBe('hydration'));

  // Mindful
  test('mindful → mindful', () => expect(detectHealthKitType('mindful')).toBe('mindful'));
  test('Meditation → mindful', () => expect(detectHealthKitType('Meditation')).toBe('mindful'));
  test('breathe → mindful', () => expect(detectHealthKitType('breathe')).toBe('mindful'));

  // Steps
  test('steps → steps', () => expect(detectHealthKitType('steps')).toBe('steps'));
  test('walk → steps', () => expect(detectHealthKitType('walk')).toBe('steps'));
  test('Daily Walk → steps', () => expect(detectHealthKitType('Daily Walk')).toBe('steps'));

  // No match
  test('Deep Work → null', () => expect(detectHealthKitType('Deep Work')).toBeNull());
  test('Read → null', () => expect(detectHealthKitType('Read')).toBeNull());
  test('No Spend → null', () => expect(detectHealthKitType('No Spend')).toBeNull());
  test('empty string → null', () => expect(detectHealthKitType('')).toBeNull());
});
