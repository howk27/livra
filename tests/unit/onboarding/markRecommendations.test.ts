import { getRecommendedMarks } from '../../../lib/onboarding/markRecommendations';
import { MARK_LIBRARY } from '../../../lib/suggestedCounters';

describe('MARK_LIBRARY', () => {
  test('has entries for all core marks', () => {
    expect(MARK_LIBRARY.length).toBeGreaterThan(0);
  });

  test('each entry has required fields', () => {
    for (const mark of MARK_LIBRARY) {
      expect(mark).toHaveProperty('id');
      expect(mark).toHaveProperty('name');
      expect(mark).toHaveProperty('icon');
      expect(mark).toHaveProperty('emoji');
      expect(mark).toHaveProperty('color');
      expect(mark).toHaveProperty('category');
      expect(mark).toHaveProperty('healthKitType');
    }
  });
});

describe('getRecommendedMarks', () => {
  test('returns empty array when selections is empty', () => {
    expect(getRecommendedMarks([], null)).toEqual([]);
    expect(getRecommendedMarks([], 'health')).toEqual([]);
  });

  test('returns all templates when selections is 3 or fewer', () => {
    const result = getRecommendedMarks(['Sleep better', 'Move my body'], null);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
  });

  test('returns exactly 3 when selections is more than 3, focusArea null — first 3 in selection order', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Drink more water', 'Read consistently'],
      null,
    );
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
    expect(result[2].name).toBe('Water');
  });

  test('health focus area prioritizes Sleep, Workout, Water when all selected', () => {
    const result = getRecommendedMarks(
      ['Read consistently', 'Plan my days', 'Sleep better', 'Move my body', 'Drink more water'],
      'health',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Sleep');
    expect(names).toContain('Workout');
    expect(names).toContain('Water');
  });

  test('career focus area prioritizes Focus, Planning, Practice', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Practice focus', 'Plan my days', 'Build a skill'],
      'career',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Focus');
    expect(names).toContain('Planning');
    expect(names).toContain('Practice');
  });

  test('creativity focus area prioritizes Practice, Focus, Sleep', () => {
    const result = getRecommendedMarks(
      ['Drink more water', 'Read consistently', 'Practice focus', 'Sleep better', 'Build a skill'],
      'creativity',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Practice');
    expect(names).toContain('Focus');
    expect(names).toContain('Sleep');
  });

  test('learning focus area prioritizes Reading, Practice, Focus', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Read consistently', 'Practice focus', 'Build a skill'],
      'learning',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Reading');
    expect(names).toContain('Practice');
    expect(names).toContain('Focus');
  });

  test('relationships focus area uses selection order (no override)', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Drink more water', 'Read consistently'],
      'relationships',
    );
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
    expect(result[2].name).toBe('Water');
  });

  test('finances focus area prioritizes Finance, Planning', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Track my finances', 'Plan my days'],
      'finances',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Finance');
    expect(names).toContain('Planning');
    expect(names[2]).toBe('Sleep'); // first non-priority item by selection order
  });

  test('returns all 3 when exactly 3 selected regardless of focusArea', () => {
    const result = getRecommendedMarks(['Sleep better', 'Move my body', 'Drink more water'], 'career');
    expect(result).toHaveLength(3);
  });

  test('returns correct category for Sleep', () => {
    const result = getRecommendedMarks(['Sleep better'], null);
    expect(result[0].category).toBe('Recovery');
  });

  test('returns correct icon component for Workout', () => {
    const result = getRecommendedMarks(['Move my body'], null);
    expect(typeof result[0].icon).toBe('function');
  });

  test('returns correct color for Water', () => {
    const result = getRecommendedMarks(['Drink more water'], null);
    expect(result[0].color).toBe('#6B9E8A');
  });

  test('healthKitType is sleep for Sleep mark', () => {
    const result = getRecommendedMarks(['Sleep better'], null);
    expect(result[0].healthKitType).toBe('sleep');
  });

  test('healthKitType is null for Water mark', () => {
    const result = getRecommendedMarks(['Drink more water'], null);
    expect(result[0].healthKitType).toBeNull();
  });

  test('silently drops unrecognized selection labels', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'UNKNOWN_LABEL', 'Move my body', 'Drink more water'],
      null,
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Sleep');
    expect(names).toContain('Workout');
    expect(names).toContain('Water');
  });
});
