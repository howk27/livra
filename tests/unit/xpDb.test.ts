import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadUserXP,
  upsertUserXP,
  insertXPEvent,
  loadXPEventsForDate,
  loadXPEventDates,
} from '../../lib/db/xpDb';
import type { UserXP, XPEvent } from '../../lib/db/xpDb';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const makeUserXP = (overrides: Partial<UserXP> = {}): UserXP => ({
  user_id: 'user-1',
  total_xp: 0,
  current_level: 1,
  cooldown_until: null,
  last_7d_bonus_date: null,
  last_30d_bonus_date: null,
  ...overrides,
});

const makeXPEvent = (overrides: Partial<XPEvent> = {}): XPEvent => ({
  id: 'evt-1',
  user_id: 'user-1',
  event_type: 'mark_logged',
  xp_awarded: 10,
  created_at: '2026-05-28T12:00:00.000Z',
  metadata: JSON.stringify({ mark_id: 'mark-1', date: '2026-05-28' }),
  ...overrides,
});

describe('loadUserXP', () => {
  it('returns null when no record exists', async () => {
    const result = await loadUserXP('user-1');
    expect(result).toBeNull();
  });

  it('returns the record after upsert', async () => {
    const xp = makeUserXP({ total_xp: 200, current_level: 2 });
    await upsertUserXP(xp);
    const result = await loadUserXP('user-1');
    expect(result).toEqual(xp);
  });
});

describe('upsertUserXP', () => {
  it('inserts a new record', async () => {
    await upsertUserXP(makeUserXP({ total_xp: 100 }));
    const result = await loadUserXP('user-1');
    expect(result?.total_xp).toBe(100);
  });

  it('updates an existing record', async () => {
    await upsertUserXP(makeUserXP({ total_xp: 100 }));
    await upsertUserXP(makeUserXP({ total_xp: 250 }));
    const result = await loadUserXP('user-1');
    expect(result?.total_xp).toBe(250);
  });

  it('does not affect other users', async () => {
    await upsertUserXP(makeUserXP({ user_id: 'user-1', total_xp: 100 }));
    await upsertUserXP(makeUserXP({ user_id: 'user-2', total_xp: 50 }));
    const u1 = await loadUserXP('user-1');
    const u2 = await loadUserXP('user-2');
    expect(u1?.total_xp).toBe(100);
    expect(u2?.total_xp).toBe(50);
  });
});

describe('insertXPEvent + loadXPEventsForDate', () => {
  it('returns empty array when no events', async () => {
    const result = await loadXPEventsForDate('user-1', '2026-05-28');
    expect(result).toHaveLength(0);
  });

  it('returns events matching date prefix', async () => {
    await insertXPEvent(makeXPEvent({ created_at: '2026-05-28T10:00:00.000Z' }));
    await insertXPEvent(makeXPEvent({ id: 'evt-2', created_at: '2026-05-29T10:00:00.000Z' }));
    const result = await loadXPEventsForDate('user-1', '2026-05-28');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('evt-1');
  });

  it('does not return events for other users', async () => {
    await insertXPEvent(makeXPEvent({ user_id: 'user-2' }));
    const result = await loadXPEventsForDate('user-1', '2026-05-28');
    expect(result).toHaveLength(0);
  });
});

describe('loadXPEventDates', () => {
  it('returns empty array when no mark_logged events', async () => {
    const result = await loadXPEventDates('user-1', 7);
    expect(result).toHaveLength(0);
  });

  it('returns distinct dates for mark_logged events within window', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await insertXPEvent(makeXPEvent({ id: 'e1', created_at: `${today}T10:00:00.000Z` }));
    await insertXPEvent(makeXPEvent({ id: 'e2', created_at: `${today}T11:00:00.000Z` }));
    const result = await loadXPEventDates('user-1', 7);
    expect(result).toHaveLength(1); // deduplicated
    expect(result[0]).toBe(today);
  });

  it('excludes non mark_logged event types', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await insertXPEvent(makeXPEvent({ event_type: 'full_day_bonus', created_at: `${today}T10:00:00.000Z` }));
    const result = await loadXPEventDates('user-1', 7);
    expect(result).toHaveLength(0);
  });
});
