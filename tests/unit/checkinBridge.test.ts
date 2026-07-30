// M9 Phase 2 — the check-in cache bridge (Option A, founder decision 2026-07-29).
//
// These pin the behaviour the whole decision rests on: a freshly-logged check-in
// appears in the query cache immediately WITHOUT a Supabase round-trip, is
// idempotent by id (so the eventual real refetch cannot double it), never seeds a
// cache entry a screen has not fetched, and is removed on undo.

import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
import { bridgeCheckinAdded, bridgeCheckinRemoved } from '../../lib/data/bridge';
import type { MarkEvent } from '../../types';
import type { MarkEventRow } from '../../lib/data/types';

const USER = 'user-1';
const MARK = 'mark-1';
const TODAY = '2026-07-29';

function makeEvent(overrides: Partial<MarkEvent> = {}): MarkEvent {
  return {
    id: 'evt-1',
    user_id: USER,
    mark_id: MARK,
    event_type: 'increment',
    amount: 1,
    occurred_at: '2026-07-29T10:00:00.000Z',
    occurred_local_date: TODAY,
    meta: {},
    created_at: '2026-07-29T10:00:00.000Z',
    updated_at: '2026-07-29T10:00:00.000Z',
    ...overrides,
  };
}

function seed(key: readonly unknown[], rows: MarkEventRow[]): void {
  queryClient.setQueryData<MarkEventRow[]>(key, rows);
}

beforeEach(() => {
  queryClient.clear();
});

describe('bridgeCheckinAdded', () => {
  test('prepends the event to all three cached check-in keys', () => {
    seed(queryKeys.checkins(USER, MARK), []);
    seed(queryKeys.userCheckins(USER), []);
    seed(queryKeys.todayCheckins(USER, TODAY), []);

    bridgeCheckinAdded(makeEvent());

    for (const key of [
      queryKeys.checkins(USER, MARK),
      queryKeys.userCheckins(USER),
      queryKeys.todayCheckins(USER, TODAY),
    ]) {
      const rows = queryClient.getQueryData<MarkEventRow[]>(key)!;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('evt-1');
    }
  });

  test('newest-first: a new event lands at the head', () => {
    const older: MarkEventRow = {
      ...makeEvent({ id: 'evt-old', occurred_at: '2026-07-29T08:00:00.000Z' }),
    } as MarkEventRow;
    seed(queryKeys.userCheckins(USER), [older]);

    bridgeCheckinAdded(makeEvent({ id: 'evt-new' }));

    const rows = queryClient.getQueryData<MarkEventRow[]>(queryKeys.userCheckins(USER))!;
    expect(rows.map((r) => r.id)).toEqual(['evt-new', 'evt-old']);
  });

  test('is idempotent by id — a real refetch carrying the same id must not double it', () => {
    seed(queryKeys.userCheckins(USER), []);

    bridgeCheckinAdded(makeEvent());
    bridgeCheckinAdded(makeEvent()); // same id (e.g. optimistic then the server row)

    const rows = queryClient.getQueryData<MarkEventRow[]>(queryKeys.userCheckins(USER))!;
    expect(rows).toHaveLength(1);
  });

  test('does NOT seed a key that was never fetched (undefined stays undefined)', () => {
    // Nothing seeded — a screen that hasn't fetched must not get a fake 1-item list.
    bridgeCheckinAdded(makeEvent());
    expect(queryClient.getQueryData(queryKeys.userCheckins(USER))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.checkins(USER, MARK))).toBeUndefined();
  });

  test('maps the store MarkEvent onto the MarkEventRow shape (deleted_at defaulted to null)', () => {
    seed(queryKeys.userCheckins(USER), []);
    bridgeCheckinAdded(makeEvent({ meta: undefined }));
    const row = queryClient.getQueryData<MarkEventRow[]>(queryKeys.userCheckins(USER))![0];
    expect(row.deleted_at).toBeNull();
    expect(row.meta).toBeNull();
    expect(row.event_type).toBe('increment');
  });
});

describe('bridgeCheckinRemoved', () => {
  test('drops the event from all three keys', () => {
    const row = makeEvent() as unknown as MarkEventRow;
    seed(queryKeys.checkins(USER, MARK), [row]);
    seed(queryKeys.userCheckins(USER), [row]);
    seed(queryKeys.todayCheckins(USER, TODAY), [row]);

    bridgeCheckinRemoved({ userId: USER, markId: MARK, eventId: 'evt-1', localDate: TODAY });

    for (const key of [
      queryKeys.checkins(USER, MARK),
      queryKeys.userCheckins(USER),
      queryKeys.todayCheckins(USER, TODAY),
    ]) {
      expect(queryClient.getQueryData<MarkEventRow[]>(key)).toEqual([]);
    }
  });

  test('leaves other events in place', () => {
    const a = makeEvent({ id: 'a' }) as unknown as MarkEventRow;
    const b = makeEvent({ id: 'b' }) as unknown as MarkEventRow;
    seed(queryKeys.userCheckins(USER), [b, a]);

    bridgeCheckinRemoved({ userId: USER, markId: MARK, eventId: 'a', localDate: TODAY });

    const rows = queryClient.getQueryData<MarkEventRow[]>(queryKeys.userCheckins(USER))!;
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  test('does not seed an unfetched key', () => {
    bridgeCheckinRemoved({ userId: USER, markId: MARK, eventId: 'evt-1', localDate: TODAY });
    expect(queryClient.getQueryData(queryKeys.userCheckins(USER))).toBeUndefined();
  });
});
