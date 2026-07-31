// M9 Phase 4 Task 1 — derived-value contracts.
//
// `total` and the current streak are derived from the event log
// (lib/data/derived.ts); these pin the derivation rules the live-data
// verification was run against (2026-07-31, all 36 live marks: SUM(amount) over
// live increments matched the stored total everywhere the stored value was
// trustworthy — the one divergence was the STORED side being stale).

import { deriveTotal, totalsByMark, deriveStreak } from '../../lib/data/derived';
import { computeStreak } from '../../hooks/useStreaks';
import type { MarkScopedEvent } from '../../lib/data/derived';
import type { CounterEvent } from '../../types';

function ev(overrides: Partial<MarkScopedEvent>): MarkScopedEvent {
  return {
    mark_id: 'mark-1',
    event_type: 'increment',
    amount: 1,
    occurred_local_date: '2026-07-01',
    deleted_at: null,
    ...overrides,
  };
}

describe('deriveTotal', () => {
  it('sums live increment amounts, defaulting a missing amount to 1', () => {
    expect(
      deriveTotal([
        ev({ amount: 1 }),
        ev({ amount: 3 }),
        ev({ amount: null }),
        ev({ amount: undefined }),
      ]),
    ).toBe(6);
  });

  it('ignores tombstoned increments — an undone check-in does not count', () => {
    expect(deriveTotal([ev({}), ev({ deleted_at: '2026-07-30T10:00:00Z' })])).toBe(1);
  });

  it('ignores legacy decrement and reset events (they exist in production history)', () => {
    // Verified live: 4 decrement + 3 reset events exist and the increment-only
    // sum still matched every trustworthy stored total.
    expect(
      deriveTotal([ev({}), ev({ event_type: 'decrement', amount: 4 }), ev({ event_type: 'reset', amount: 10 })]),
    ).toBe(1);
  });

  it('is 0 for no events', () => {
    expect(deriveTotal([])).toBe(0);
  });
});

describe('totalsByMark', () => {
  it('groups live increment sums by mark and omits marks with no live increments', () => {
    const totals = totalsByMark([
      ev({ mark_id: 'a' }),
      ev({ mark_id: 'a', amount: 2 }),
      ev({ mark_id: 'b' }),
      ev({ mark_id: 'c', deleted_at: '2026-07-30T10:00:00Z' }),
      ev({ mark_id: 'c', event_type: 'decrement' }),
    ]);
    expect(totals.get('a')).toBe(3);
    expect(totals.get('b')).toBe(1);
    // The adapter's `totals.get(id) ?? 0` supplies the zero for untouched marks.
    expect(totals.has('c')).toBe(false);
  });
});

describe('deriveStreak', () => {
  const today = new Date('2026-07-10T12:00:00');

  it('counts consecutive days back from the most recent activity', () => {
    const s = deriveStreak(
      [ev({ occurred_local_date: '2026-07-10' }), ev({ occurred_local_date: '2026-07-09' }), ev({ occurred_local_date: '2026-07-08' })],
      today,
    );
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.lastDate).toBe('2026-07-10');
  });

  it('keeps the streak alive when the last activity was yesterday, kills it beyond that', () => {
    expect(deriveStreak([ev({ occurred_local_date: '2026-07-09' })], today).current).toBe(1);
    expect(deriveStreak([ev({ occurred_local_date: '2026-07-08' })], today).current).toBe(0);
  });

  it('remembers the longest run even after a break', () => {
    const s = deriveStreak(
      [
        ev({ occurred_local_date: '2026-07-01' }),
        ev({ occurred_local_date: '2026-07-02' }),
        ev({ occurred_local_date: '2026-07-03' }),
        ev({ occurred_local_date: '2026-07-10' }),
      ],
      today,
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
  });

  it('counts a day once however many times it was logged', () => {
    const s = deriveStreak(
      [ev({ occurred_local_date: '2026-07-10' }), ev({ occurred_local_date: '2026-07-10' })],
      today,
    );
    expect(s.current).toBe(1);
  });

  it('ignores tombstoned events, non-increments, and malformed dates', () => {
    const s = deriveStreak(
      [
        ev({ occurred_local_date: '2026-07-10', deleted_at: '2026-07-30T10:00:00Z' }),
        ev({ occurred_local_date: '2026-07-10', event_type: 'decrement' }),
        ev({ occurred_local_date: 'not-a-date' }),
      ],
      today,
    );
    expect(s.current).toBe(0);
    expect(s.longest).toBe(0);
  });
});

describe('computeStreak delegates to deriveStreak (one implementation)', () => {
  it('returns identical results through both entry points', () => {
    const rows = [
      { occurred_local_date: '2026-07-10' },
      { occurred_local_date: '2026-07-09' },
      { occurred_local_date: '2026-07-05' },
    ].map((d, i) => ({
      id: String(i),
      user_id: 'u',
      counter_id: 'c',
      event_type: 'increment',
      amount: 1,
      occurred_at: `${d.occurred_local_date}T09:00:00Z`,
      occurred_local_date: d.occurred_local_date,
      created_at: '2026-07-10T09:00:00Z',
      updated_at: '2026-07-10T09:00:00Z',
    })) as CounterEvent[];
    const today = new Date('2026-07-10T12:00:00');
    expect(computeStreak(rows, today)).toEqual(deriveStreak(rows, today));
  });
});
