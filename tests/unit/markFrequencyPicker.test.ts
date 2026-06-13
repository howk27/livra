/**
 * Tests for MarkFrequencyPicker helpers.
 *
 * NOTE: Full render tests would require @testing-library/react-native with
 * proper RN mocks; the pure-logic tests below cover all exported helper
 * functions and the chip-value derivation algorithm used by the component.
 */

import { frequencyLabel, deriveChipValues } from '../../components/ui/MarkFrequencyPicker';

// ── frequencyLabel ────────────────────────────────────────────────────────────

describe('frequencyLabel', () => {
  test('1 → "Once a week"', () => {
    expect(frequencyLabel(1)).toBe('Once a week');
  });

  test('2 → "Twice a week"', () => {
    expect(frequencyLabel(2)).toBe('Twice a week');
  });

  test('7 → "Every day"', () => {
    expect(frequencyLabel(7)).toBe('Every day');
  });

  test('3 → "3× a week"', () => {
    expect(frequencyLabel(3)).toBe('3× a week');
  });

  test('5 → "5× a week"', () => {
    expect(frequencyLabel(5)).toBe('5× a week');
  });

  test('4 → "4× a week"', () => {
    expect(frequencyLabel(4)).toBe('4× a week');
  });

  test('6 → "6× a week"', () => {
    expect(frequencyLabel(6)).toBe('6× a week');
  });
});

// ── deriveChipValues ──────────────────────────────────────────────────────────

describe('deriveChipValues', () => {
  test('[3, 5, 7] → [3, 5, 7] (no dedup needed)', () => {
    expect(deriveChipValues(3, 5, 7)).toEqual([3, 5, 7]);
  });

  test('[3, 3, 7] → [3, 7] (dedup middle)', () => {
    expect(deriveChipValues(3, 3, 7)).toEqual([3, 7]);
  });

  test('[7, 7, 7] → [7] (all same — fixed mark scenario)', () => {
    expect(deriveChipValues(7, 7, 7)).toEqual([7]);
  });

  test('[1, 3, 7] → [1, 3, 7]', () => {
    expect(deriveChipValues(1, 3, 7)).toEqual([1, 3, 7]);
  });

  test('[2, 2, 5] → [2, 5] (dedup first two)', () => {
    expect(deriveChipValues(2, 2, 5)).toEqual([2, 5]);
  });

  test('[3, 5, 5] → [3, 5] (dedup last two)', () => {
    expect(deriveChipValues(3, 5, 5)).toEqual([3, 5]);
  });

  test('result is always sorted ascending', () => {
    // Even if inputs are misordered the result should be sorted
    const result = deriveChipValues(7, 3, 5);
    expect(result).toEqual([3, 5, 7]);
  });
});
