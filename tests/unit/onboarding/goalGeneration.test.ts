/**
 * Phase 4b Task 1 — AI goal generation unit tests.
 *
 * Covers:
 *   1. validateAIGoalPackage: valid input, off-model icon repair, >3 marks truncation,
 *      out-of-range frequency drop, missing name/why drop, bad envelope → null.
 *   2. normalizeGoalText: lowercasing, stop-word removal, sort, dedup handling.
 *   3. resolveMarkForAIIcon: known icon → correct markId; unknown icon → fallback.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  validateAIGoalPackage,
  normalizeGoalText,
  resolveMarkForAIIcon,
  VALID_ICONS,
  AI_ICON_TO_MARK_ID,
} from '../../../lib/ai/goalGeneration';
import { MARK_LIBRARY } from '../../../lib/suggestedCounters';

// ─── validateAIGoalPackage ────────────────────────────────────────────────────

describe('validateAIGoalPackage', () => {
  const validPackage = {
    goalTitle: 'Run a half marathon',
    timeframeWeeks: 12,
    confidence: 'high',
    marks: [
      { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance' },
      { name: 'Stretching', icon: 'rest', frequency: 3, why: 'Prevents injury' },
    ],
  };

  test('accepts valid package unchanged', () => {
    const result = validateAIGoalPackage(validPackage);
    expect(result).not.toBeNull();
    expect(result!.goalTitle).toBe('Run a half marathon');
    expect(result!.timeframeWeeks).toBe(12);
    expect(result!.confidence).toBe('high');
    expect(result!.marks).toHaveLength(2);
  });

  test('trims whitespace from goalTitle and mark fields', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      goalTitle: '  Run a marathon  ',
      marks: [{ name: '  Morning run  ', icon: 'gym', frequency: 3, why: '  Builds base  ' }],
    });
    expect(result!.goalTitle).toBe('Run a marathon');
    expect(result!.marks[0].name).toBe('Morning run');
    expect(result!.marks[0].why).toBe('Builds base');
  });

  test('repairs off-model icon to FALLBACK_ICON (focus)', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: 'Daily habit', icon: 'totally_invalid_icon', frequency: 3, why: 'Important' },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.marks[0].icon).toBe('focus');
  });

  test('does NOT drop off-model icon — repairs it instead', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: 'Mark A', icon: 'bad_icon', frequency: 3, why: 'Reason A' },
        { name: 'Mark B', icon: 'gym', frequency: 2, why: 'Reason B' },
      ],
    });
    expect(result!.marks).toHaveLength(2);
    expect(result!.marks[0].icon).toBe('focus');
    expect(result!.marks[1].icon).toBe('gym');
  });

  test('drops mark with frequency out of 1–7 (too high)', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: 'Valid mark', icon: 'gym', frequency: 3, why: 'Good' },
        { name: 'Bad freq', icon: 'sleep', frequency: 8, why: 'Bad' },
      ],
    });
    expect(result!.marks).toHaveLength(1);
    expect(result!.marks[0].name).toBe('Valid mark');
  });

  test('drops mark with frequency 0 (too low)', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [{ name: 'Zero freq', icon: 'gym', frequency: 0, why: 'Bad' }],
    });
    expect(result).toBeNull();
  });

  test('rounds non-integer frequency', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [{ name: 'Float freq', icon: 'gym', frequency: 3.7, why: 'Good' }],
    });
    expect(result!.marks[0].frequency).toBe(4);
  });

  test('drops mark with missing name', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: '', icon: 'gym', frequency: 3, why: 'Good' },
        { name: 'Valid', icon: 'sleep', frequency: 2, why: 'Good' },
      ],
    });
    expect(result!.marks).toHaveLength(1);
    expect(result!.marks[0].name).toBe('Valid');
  });

  test('truncates to 3 marks max', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: 'M1', icon: 'gym', frequency: 3, why: 'W1' },
        { name: 'M2', icon: 'sleep', frequency: 2, why: 'W2' },
        { name: 'M3', icon: 'reading', frequency: 4, why: 'W3' },
        { name: 'M4', icon: 'water', frequency: 7, why: 'W4' },
      ],
    });
    expect(result!.marks).toHaveLength(3);
    expect(result!.marks.map((m) => m.name)).toEqual(['M1', 'M2', 'M3']);
  });

  test('returns null when no valid marks remain', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: '', icon: 'gym', frequency: 3, why: 'Good' },
        { name: 'Bad freq', icon: 'sleep', frequency: 99, why: 'Bad' },
      ],
    });
    expect(result).toBeNull();
  });

  test('returns null for non-object input', () => {
    expect(validateAIGoalPackage(null)).toBeNull();
    expect(validateAIGoalPackage('string')).toBeNull();
    expect(validateAIGoalPackage(42)).toBeNull();
    expect(validateAIGoalPackage(undefined)).toBeNull();
  });

  test('returns null for missing goalTitle', () => {
    const { goalTitle: _omit, ...rest } = validPackage;
    expect(validateAIGoalPackage(rest)).toBeNull();
  });

  test('returns null for timeframeWeeks out of 1–52', () => {
    expect(validateAIGoalPackage({ ...validPackage, timeframeWeeks: 0 })).toBeNull();
    expect(validateAIGoalPackage({ ...validPackage, timeframeWeeks: 53 })).toBeNull();
  });

  test('returns null for invalid confidence value', () => {
    expect(validateAIGoalPackage({ ...validPackage, confidence: 'medium' })).toBeNull();
  });

  test('accepts confidence "low" — caller decides what to do with it', () => {
    const result = validateAIGoalPackage({ ...validPackage, confidence: 'low' });
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('low');
  });

  test('gym and steps coexist uncollapsed (distinct efforts, spec 2026-07-12)', () => {
    const result = validateAIGoalPackage({
      ...validPackage,
      marks: [
        { name: 'Lift', icon: 'gym', frequency: 3, why: 'Builds strength' },
        { name: 'Walk 8k steps', icon: 'steps', frequency: 7, why: 'Daily movement base' },
      ],
    });
    expect(result!.marks.map((m) => m.icon)).toEqual(['gym', 'steps']);
  });

  test('all VALID_ICONS pass through without repair', () => {
    for (const icon of VALID_ICONS) {
      const result = validateAIGoalPackage({
        ...validPackage,
        marks: [{ name: 'Test', icon, frequency: 3, why: 'Why' }],
      });
      expect(result!.marks[0].icon).toBe(icon);
    }
  });
});

// ─── normalizeGoalText ────────────────────────────────────────────────────────

describe('normalizeGoalText', () => {
  test('lowercases input', () => {
    expect(normalizeGoalText('Run A Marathon')).toBe(normalizeGoalText('run a marathon'));
  });

  test('removes stop words', () => {
    const words = normalizeGoalText('I want to run a marathon').split(' ');
    expect(words).not.toContain('i');
    expect(words).not.toContain('want');
    expect(words).not.toContain('to');
    expect(words).not.toContain('a');
    expect(words).toContain('run');
    expect(words).toContain('marathon');
  });

  test('sorts words so different word orders produce same key', () => {
    const a = normalizeGoalText('lose weight and get fit');
    const b = normalizeGoalText('get fit and lose weight');
    expect(a).toBe(b);
  });

  test('strips punctuation', () => {
    const result = normalizeGoalText('run 5k, every day!');
    expect(result).not.toMatch(/[,!]/);
  });

  test('filters single-character tokens', () => {
    const result = normalizeGoalText('do x daily');
    expect(result.split(' ')).not.toContain('x');
  });

  test('returns empty string for stop-word-only input', () => {
    expect(normalizeGoalText('I want to be')).toBe('');
  });

  test('semantically similar goals map to the same key', () => {
    const a = normalizeGoalText('I want to get fit and lose weight');
    const b = normalizeGoalText('lose weight get fit');
    expect(a).toBe(b);
  });
});

// ─── resolveMarkForAIIcon ─────────────────────────────────────────────────────

describe('resolveMarkForAIIcon', () => {
  test('known icon maps to correct markId', () => {
    expect(resolveMarkForAIIcon('gym').markId).toBe('workout');
    expect(resolveMarkForAIIcon('sleep').markId).toBe('sleep');
    expect(resolveMarkForAIIcon('reading').markId).toBe('reading');
  });

  test('returns emoji and color for known icons', () => {
    const result = resolveMarkForAIIcon('gym');
    expect(typeof result.emoji).toBe('string');
    expect(result.emoji.length).toBeGreaterThan(0);
    expect(typeof result.color).toBe('string');
    expect(result.color).toMatch(/^#/);
  });

  test('unknown icon falls back to FALLBACK_ICON (focus)', () => {
    const result = resolveMarkForAIIcon('completely_unknown');
    expect(result.markId).toBe('focus');
  });

  test('all VALID_ICONS resolve without fallback', () => {
    for (const icon of VALID_ICONS) {
      const result = resolveMarkForAIIcon(icon);
      expect(result.markId).not.toBe('');
      expect(result.emoji).not.toBe('');
    }
  });

  test('every VALID_ICON maps to a real MARK_LIBRARY entry (no fallback hits)', () => {
    for (const icon of VALID_ICONS) {
      // The mapping table must cover the icon explicitly — a miss here would
      // silently reroute to FALLBACK_ICON inside resolveMarkForAIIcon.
      expect(AI_ICON_TO_MARK_ID[icon]).toBeDefined();

      const mark = MARK_LIBRARY.find((m) => m.id === AI_ICON_TO_MARK_ID[icon]);
      expect(mark).toBeDefined();

      // resolveMarkForAIIcon must return the real library entry, not the
      // '🎯' / '#4A6A8C' "mark not found" defaults.
      const result = resolveMarkForAIIcon(icon);
      expect(result.markId).toBe(AI_ICON_TO_MARK_ID[icon]);
      expect(result.emoji).toBe(mark!.emoji);
      expect(result.color).toBe(mark!.color);
    }
  });
});

// ─── Client/server VALID_ICONS drift guard (FU-2) ─────────────────────────────

describe('VALID_ICONS client/server drift guard', () => {
  /**
   * The Edge Function keeps its own copy of VALID_ICONS (it cannot import from
   * lib/ due to the Deno/Metro boundary). This test parses that copy straight
   * out of the function source so any edit to either list that is not mirrored
   * in the other fails CI.
   */
  function readServerValidIcons(): string[] {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../supabase/functions/ai-goal-generation/index.ts'),
      'utf8',
    );
    const match = source.match(/const VALID_ICONS = \[([\s\S]*?)\] as const;/);
    if (!match) throw new Error('Could not locate VALID_ICONS in edge function source');
    return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  test('edge-function VALID_ICONS is byte-identical to the client list', () => {
    expect(readServerValidIcons()).toEqual([...VALID_ICONS]);
  });

  test('client list contains exactly 29 icons with no duplicates', () => {
    expect(VALID_ICONS).toHaveLength(29);
    expect(new Set(VALID_ICONS).size).toBe(29);
  });
});
