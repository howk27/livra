import {
  lastLogDate, isComebackState, endsComebackGap, pickComebackMove, resolveComebackAsk,
} from '../../lib/comeback';
import type { MarkEvent } from '../../types';

const ev = (date: string, over: Partial<MarkEvent> = {}): MarkEvent =>
  ({ id: `e-${date}-${Math.random()}`, mark_id: 'm1', event_type: 'increment',
     occurred_local_date: date, amount: 1, deleted_at: null, ...over } as MarkEvent);

describe('lastLogDate', () => {
  it('returns the latest increment date, ignoring deleted and non-increment events', () => {
    expect(lastLogDate([
      ev('2026-07-20'), ev('2026-07-22'),
      ev('2026-07-23', { deleted_at: '2026-07-23T10:00:00Z' }),
      ev('2026-07-23', { event_type: 'decrement' as MarkEvent['event_type'] }),
    ])).toBe('2026-07-22');
  });
  it('returns null with no qualifying events', () => expect(lastLogDate([])).toBeNull());
});

describe('isComebackState — 2+ FULL quiet local days', () => {
  it('last log 3 days ago (2 full quiet days) → comeback', () =>
    expect(isComebackState([ev('2026-07-21')], '2026-07-24')).toBe(true));
  it('last log 2 days ago (1 full quiet day) → NOT comeback', () =>
    expect(isComebackState([ev('2026-07-22')], '2026-07-24')).toBe(false));
  it('logged yesterday → not comeback', () =>
    expect(isComebackState([ev('2026-07-23')], '2026-07-24')).toBe(false));
  it('never logged → not comeback (brand-new user is firstWeek territory)', () =>
    expect(isComebackState([], '2026-07-24')).toBe(false));
  it('month boundary: 2026-06-30 → 2026-07-03 is a comeback', () =>
    expect(isComebackState([ev('2026-06-30')], '2026-07-03')).toBe(true));
});

describe('endsComebackGap — the just-landed log is already in events', () => {
  it('today has the fresh log; the gap before it still reads as a comeback', () =>
    expect(endsComebackGap([ev('2026-07-21'), ev('2026-07-24')], '2026-07-24')).toBe(true));
  it('no gap before today → false', () =>
    expect(endsComebackGap([ev('2026-07-23'), ev('2026-07-24')], '2026-07-24')).toBe(false));
});

describe('pickComebackMove', () => {
  const m = (id: string, dailyTarget: number) =>
    ({ id, dailyTarget, name: id, weekly_target: 5, frequency_kind: 'variable' as const });
  it('picks the lowest daily ask', () =>
    expect(pickComebackMove([m('a', 3), m('b', 1), m('c', 2)])?.id).toBe('b'));
  it('tie breaks by given order', () =>
    expect(pickComebackMove([m('a', 1), m('b', 1)])?.id).toBe('a'));
  it('empty → null', () => expect(pickComebackMove([])).toBeNull());
});

describe('resolveComebackAsk', () => {
  it('unknown/custom mark falls back to the generic ask', () =>
    expect(resolveComebackAsk({ name: 'Whittle spoons' })).toBe('The smallest version counts today.'));
  it('never returns an empty string for a library mark', () =>
    expect(resolveComebackAsk({ name: 'Run' }).length).toBeGreaterThan(0));
});
