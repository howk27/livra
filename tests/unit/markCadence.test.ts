// A mark with no stored cadence used to fall through `weekly_target ?? 3`, so
// the goal bar and the Focus strikethrough drew against a 3x/week number nobody
// chose. Measured live 2026-08-08: 8 of 40 active marks, all created on or
// before 2026-07-21.

import {
  resolveRowCadence,
  CADENCE_FALLBACK_WEEKLY_TARGET,
  type RowCadence,
} from '@/lib/markCadence';

const EMPTY: RowCadence = {
  frequency_min: null,
  frequency_recommended: null,
  frequency_max: null,
  weekly_target: null,
  frequency_kind: null,
};

describe('resolveRowCadence — the live NULL-cadence rows', () => {
  // Exactly the eight rows found in production, with the emoji each carries.
  it.each([
    ['Run', '🏃', 2, 3, 5, 3, 'variable'],
    ['Steps', '👣', 5, 7, 7, 7, 'variable'],
    ['Swim', '🏊', 2, 3, 5, 3, 'variable'],
    // AI-authored names — these resolve on the EMOJI leg, which is the whole
    // reason no hand-written name table is needed.
    ['Attend gym sessions', '🏋️', 2, 3, 5, 3, 'variable'],
    ['Incorporate stretching routines', '🧘', 3, 5, 7, 5, 'variable'],
    ['Track daily step count', '👣', 5, 7, 7, 7, 'variable'],
  ])('%s (%s) resolves to its library cadence', (name, emoji, min, rec, max, target, kind) => {
    expect(resolveRowCadence({ name, emoji: emoji as string }, EMPTY)).toEqual({
      frequency_min: min,
      frequency_recommended: rec,
      frequency_max: max,
      weekly_target: target,
      frequency_kind: kind,
    });
  });

  it('resolves by NAME even when the emoji is missing entirely', () => {
    expect(resolveRowCadence({ name: 'Steps' }, EMPTY).weekly_target).toBe(7);
  });

  it('is case- and whitespace-insensitive on the name', () => {
    expect(resolveRowCadence({ name: '  sTePs  ' }, EMPTY).weekly_target).toBe(7);
  });
});

describe('resolveRowCadence — stored values always win', () => {
  it('never overwrites a stored cadence, even one that disagrees with the library', () => {
    // This is what a Pace change looks like: Steps pulled down to 5.
    const stored: RowCadence = {
      frequency_min: 5,
      frequency_recommended: 7,
      frequency_max: 7,
      weekly_target: 5,
      frequency_kind: 'variable',
    };
    expect(resolveRowCadence({ name: 'Steps', emoji: '👣' }, stored)).toEqual(stored);
  });

  it('fills only the absent fields, leaving stored ones alone', () => {
    const partial: RowCadence = { ...EMPTY, weekly_target: 2 };
    const out = resolveRowCadence({ name: 'Run', emoji: '🏃' }, partial);
    expect(out.weekly_target).toBe(2); // stored, kept
    expect(out.frequency_min).toBe(2); // absent, filled
    expect(out.frequency_max).toBe(5);
    expect(out.frequency_kind).toBe('variable');
  });
});

describe('resolveRowCadence — marks the library does not know', () => {
  it('falls back to the same 3 the `?? 3` it replaces used', () => {
    const out = resolveRowCadence({ name: 'Water my neighbour ficus', emoji: '🪴' }, EMPTY);
    expect(out.weekly_target).toBe(CADENCE_FALLBACK_WEEKLY_TARGET);
    // Nothing is invented for the range — a custom mark has no library shape,
    // and a fabricated min/max would let Pace move it to numbers nobody chose.
    expect(out.frequency_min).toBeNull();
    expect(out.frequency_max).toBeNull();
    expect(out.frequency_kind).toBeNull();
  });
});

describe('resolveRowCadence — the unchecked cast this removes', () => {
  it('treats an unrecognised stored kind as absent rather than passing it on', () => {
    // The column has no CHECK constraint; the call sites used to `as`-cast it.
    const out = resolveRowCadence(
      { name: 'Steps', emoji: '👣' },
      { ...EMPTY, frequency_kind: 'sporadic' }
    );
    expect(out.frequency_kind).toBe('variable');
  });

  it('does not let a bad kind survive on a mark the library cannot resolve', () => {
    const out = resolveRowCadence({ name: 'Nonsense mark' }, { ...EMPTY, frequency_kind: 'junk' });
    expect(out.frequency_kind).toBeNull();
  });
});
