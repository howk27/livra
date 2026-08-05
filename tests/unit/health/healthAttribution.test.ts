// "Logged from Apple Health" attribution predicate (T4, spec §2.8).
//
// Pure over MarkEventRow lists so the mark-detail surface stays a one-line
// ternary. KNOWN LIMIT (T3 finding 2): pulled rows carry no `source` until the
// server migration + MARK_EVENT_COLUMNS follow-up, so pre-migration this sees
// only rows written locally this session — the predicate itself is future-proof.

import { hasHealthCheckinOn } from '../../../lib/health/healthAttribution';
import type { MarkEventRow } from '../../../lib/data/types';

const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';
const OTHER = 'b2c3d4e5-2222-4333-8444-555566667777';
const DAY = '2026-08-05';

function row(over: Partial<MarkEventRow> = {}): MarkEventRow {
  return {
    id: 'e1',
    user_id: 'u1',
    mark_id: MARK,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${DAY}T09:00:00.000Z`,
    occurred_local_date: DAY,
    meta: null,
    created_at: `${DAY}T09:00:00.000Z`,
    updated_at: `${DAY}T09:00:00.000Z`,
    deleted_at: null,
    ...over,
  } as MarkEventRow;
}

describe('hasHealthCheckinOn', () => {
  it('is true for a live health-sourced increment on the day', () => {
    expect(hasHealthCheckinOn([row({ source: 'health' })], MARK, DAY)).toBe(true);
  });

  it('is false for manual rows (no source key)', () => {
    expect(hasHealthCheckinOn([row()], MARK, DAY)).toBe(false);
  });

  it('is false for another mark, another day, or a tombstoned row', () => {
    expect(hasHealthCheckinOn([row({ source: 'health', mark_id: OTHER })], MARK, DAY)).toBe(false);
    expect(
      hasHealthCheckinOn([row({ source: 'health', occurred_local_date: '2026-08-04' })], MARK, DAY),
    ).toBe(false);
    expect(
      hasHealthCheckinOn([row({ source: 'health', deleted_at: `${DAY}T10:00:00.000Z` })], MARK, DAY),
    ).toBe(false);
  });

  it('is false for undefined/empty lists (loading and empty states)', () => {
    expect(hasHealthCheckinOn(undefined, MARK, DAY)).toBe(false);
    expect(hasHealthCheckinOn([], MARK, DAY)).toBe(false);
  });
});
