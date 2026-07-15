import {
  resolveMarkCategory,
  majorityCategory,
  resolveLibraryMark,
  resolveMarkIcon,
  dominantMark,
} from '../../lib/markCategoryResolve';
import { MARK_LIBRARY, MARK_LIBRARY_BY_ID } from '../../lib/suggestedCounters';

describe('resolveLibraryMark', () => {
  it('matches by library name first, case-insensitive and trimmed', () => {
    expect(resolveLibraryMark({ name: '  stretch ', emoji: null })?.id).toBe('stretch');
    expect(resolveLibraryMark({ name: 'No Sugar', emoji: '🚫' })?.id).toBe('no-sugar');
  });

  it('falls back to emoji when the name is not a library name (AI-authored names)', () => {
    expect(resolveLibraryMark({ name: 'Morning stretch routine', emoji: '🧘' })?.id).toBe(
      'stretch',
    );
  });

  it('returns undefined for custom marks matching nothing', () => {
    expect(resolveLibraryMark({ name: 'Xyzzy', emoji: '🦄' })).toBeUndefined();
    expect(resolveLibraryMark({ name: 'Xyzzy' })).toBeUndefined();
  });

  it('name match outranks a colliding emoji (🚫 is shared by no-alcohol and no-sugar)', () => {
    expect(resolveLibraryMark({ name: 'No Alcohol', emoji: '🚫' })?.id).toBe('no-alcohol');
    expect(resolveLibraryMark({ name: 'No Sugar', emoji: '🚫' })?.id).toBe('no-sugar');
  });

  it('name match is immune to a legacy emoji pointing at another mark (🧘 meditation era)', () => {
    // Marks created when meditation carried 🧘 must still resolve to meditation.
    expect(resolveLibraryMark({ name: 'Meditation', emoji: '🧘' })?.id).toBe('meditation');
  });

  it('documents the full library emoji-collision surface: only 🚫', () => {
    const byEmoji = new Map<string, string[]>();
    for (const m of MARK_LIBRARY) {
      byEmoji.set(m.emoji, [...(byEmoji.get(m.emoji) ?? []), m.id]);
    }
    const collisions = [...byEmoji.entries()].filter(([, ids]) => ids.length > 1);
    expect(collisions).toEqual([['🚫', ['no-alcohol', 'no-sugar']]]);
  });
});

describe('resolveMarkIcon', () => {
  it("returns the mark's OWN library icon, not the category icon", () => {
    // Stretch is category Recovery (Moon in CATEGORY_MAP) — the founder's bug.
    expect(resolveMarkIcon({ name: 'Stretch', emoji: '🧘' })).toBe(
      MARK_LIBRARY_BY_ID.stretch.icon,
    );
    expect(resolveMarkIcon({ name: 'Run', emoji: '🏃' })).toBe(MARK_LIBRARY_BY_ID.run.icon);
  });

  it('resolves colliding-emoji marks to their own icons via the name', () => {
    expect(resolveMarkIcon({ name: 'No Sugar', emoji: '🚫' })).toBe(
      MARK_LIBRARY_BY_ID['no-sugar'].icon,
    );
    expect(resolveMarkIcon({ name: 'No Alcohol', emoji: '🚫' })).toBe(
      MARK_LIBRARY_BY_ID['no-alcohol'].icon,
    );
  });

  it('returns null for custom marks so callers keep the CATEGORY_MAP fallback', () => {
    expect(resolveMarkIcon({ name: 'Xyzzy', emoji: '🦄' })).toBeNull();
  });
});

describe('resolveMarkCategory', () => {
  it('matches MARK_LIBRARY by emoji when the name is not a library name', () => {
    // '🌙' is the library Sleep mark → category 'Recovery' (library outranks
    // the icon resolver, which would say 'sleep').
    expect(resolveMarkCategory({ name: 'Anything', emoji: '🌙' })).toBe('Recovery');
  });

  it('matches by name first, so colliding emojis keep their own category', () => {
    expect(resolveMarkCategory({ name: 'No Sugar', emoji: '🚫' })).toBe('Discipline');
    expect(resolveMarkCategory({ name: 'No Alcohol', emoji: '🚫' })).toBe('Health');
  });

  it('falls back to resolveCounterIconType by name when no library emoji matches', () => {
    expect(resolveMarkCategory({ name: 'Plan the day', emoji: undefined })).toBe('planning');
  });

  it("falls back to 'custom' when nothing matches", () => {
    expect(resolveMarkCategory({ name: 'Xyzzy', emoji: '🦄' })).toBe('custom');
  });
});

describe('majorityCategory', () => {
  it("returns 'custom' when there are no marks", () => {
    expect(majorityCategory([])).toBe('custom');
  });

  it('returns the majority category across marks', () => {
    expect(
      majorityCategory([
        { name: 'Sleep', emoji: '🌙' },
        { name: 'Rest Day', emoji: '😴' },
        { name: 'Workout', emoji: '🏋️' },
      ]),
    ).toBe('Recovery');
  });

  it('resolves a tie to the first category to reach the winning count', () => {
    expect(
      majorityCategory([
        { name: 'Workout', emoji: '🏋️' },
        { name: 'Sleep', emoji: '🌙' },
      ]),
    ).toBe('Fitness');
  });
});

describe('dominantMark (goal-detail medallion derivation)', () => {
  it('returns null for an empty goal (medallion keeps the category/custom fallback)', () => {
    expect(dominantMark([])).toBeNull();
  });

  it('picks the most-logged mark by all-time total', () => {
    const marks = [
      { name: 'Run', emoji: '🏃', total: 2 },
      { name: 'Stretch', emoji: '🧘', total: 9 },
      { name: 'Sleep', emoji: '🌙', total: 4 },
    ];
    expect(dominantMark(marks)).toBe(marks[1]);
  });

  it('breaks ties by first in mark order', () => {
    const marks = [
      { name: 'Run', emoji: '🏃', total: 3 },
      { name: 'Stretch', emoji: '🧘', total: 3 },
    ];
    expect(dominantMark(marks)).toBe(marks[0]);
  });

  it('treats missing totals as zero', () => {
    const marks = [
      { name: 'Run', emoji: '🏃', total: null },
      { name: 'Stretch', emoji: '🧘', total: 1 },
    ];
    expect(dominantMark(marks)).toBe(marks[1]);
  });

  it("medallion end-to-end: dominant mark's own icon wins ('marathon with a moon' bug)", () => {
    // Marathon goal: mostly-logged Run must surface the run icon, even when
    // the majority category is Recovery (whose CATEGORY_MAP icon is Moon).
    const marks = [
      { name: 'Sleep', emoji: '🌙', total: 1 },
      { name: 'Stretch', emoji: '🧘', total: 2 },
      { name: 'Run', emoji: '🏃', total: 8 },
    ];
    const hero = dominantMark(marks);
    expect(hero).toBe(marks[2]);
    expect(resolveMarkIcon(hero!)).toBe(MARK_LIBRARY_BY_ID.run.icon);
  });
});
