// The AsyncStorage-backed mock DB dispatched INSERT INTO lc_counters on
// params.length. mergeCounter's insert (with dailyTarget + goal_id) is 15
// params, which collided with the 15-param *gating* branch: created_at was
// written into gated, and deleted_at / dailyTarget / goal_id were dropped
// entirely. That is silent data loss on the exact path a reinstall restores
// through. The handler now maps params by the column list in the SQL, so
// adding a column can no longer shift another one's meaning.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { execute, query, resetDatabaseState, initDatabase } from '../../lib/db';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MARK_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetDatabaseState();
  await initDatabase();
});

describe('INSERT INTO lc_counters maps params by column name', () => {
  it('stores every column of the sync insert, including the frequency fields', async () => {
    await execute(
      `INSERT INTO lc_counters (
        id, user_id, name, emoji, color, unit, enable_streak,
        sort_index, total, last_activity_date, deleted_at, created_at, updated_at, dailyTarget, goal_id,
        frequency_min, frequency_recommended, frequency_max, weekly_target, frequency_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        MARK_ID,
        USER_ID,
        'Run',
        '🏃',
        '#000000',
        'sessions',
        1,
        0,
        4,
        '2026-07-01',
        null,
        '2026-06-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
        2,
        'goal-1',
        1,
        3,
        7,
        3,
        'variable',
      ],
    );

    const rows = await query<any>('SELECT * FROM lc_counters WHERE id = ?', [MARK_ID]);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    // The columns the old length-branch collision destroyed:
    expect(row.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(row.updated_at).toBe('2026-07-01T00:00:00.000Z');
    expect(row.deleted_at).toBeNull();
    expect(row.dailyTarget).toBe(2);
    expect(row.goal_id).toBe('goal-1');
    expect(row.gated).toBeNull();

    // The frequency model — the whole point of the reinstall fix:
    expect(row.frequency_min).toBe(1);
    expect(row.frequency_recommended).toBe(3);
    expect(row.frequency_max).toBe(7);
    expect(row.weekly_target).toBe(3);
    expect(row.frequency_kind).toBe('variable');
  });

  it('still stores gating fields for the addMark insert shape', async () => {
    await execute(
      'INSERT INTO lc_counters (id, user_id, name, emoji, color, unit, enable_streak, sort_index, total, created_at, updated_at, gated, gate_type, min_interval_minutes, max_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        MARK_ID,
        USER_ID,
        'Read',
        '📖',
        '#111111',
        'sessions',
        1,
        0,
        0,
        '2026-06-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
        1,
        'interval',
        30,
        5,
      ],
    );

    const row = (await query<any>('SELECT * FROM lc_counters WHERE id = ?', [MARK_ID]))[0];
    expect(row.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(row.gated).toBe(1);
    expect(row.gate_type).toBe('interval');
    expect(row.min_interval_minutes).toBe(30);
    expect(row.max_per_day).toBe(5);
    expect(row.goal_id).toBeNull();
  });
});

describe('UPDATE lc_counters keeps an explicitly supplied updated_at', () => {
  it('does not clobber the remote updated_at on a sync merge', async () => {
    await execute(
      `INSERT INTO lc_counters (
        id, user_id, name, emoji, color, unit, enable_streak,
        sort_index, total, last_activity_date, deleted_at, created_at, updated_at, dailyTarget, goal_id,
        frequency_min, frequency_recommended, frequency_max, weekly_target, frequency_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        MARK_ID, USER_ID, 'Run', '🏃', '#000000', 'sessions', 1, 0, 4, '2026-07-01', null,
        '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 2, 'goal-1', 1, 3, 7, 3, 'variable',
      ],
    );

    await execute(
      `UPDATE lc_counters SET
        name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
        sort_index = ?, total = ?, last_activity_date = ?, deleted_at = ?, dailyTarget = ?, goal_id = ?,
        frequency_min = ?, frequency_recommended = ?, frequency_max = ?, weekly_target = ?, frequency_kind = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        'Run', '🏃', '#000000', 'sessions', 1, 0, 9, '2026-07-05', null, 2, 'goal-1',
        1, 5, 7, 5, 'fixed', '2026-07-10T00:00:00.000Z', MARK_ID,
      ],
    );

    const row = (await query<any>('SELECT * FROM lc_counters WHERE id = ?', [MARK_ID]))[0];
    expect(row.updated_at).toBe('2026-07-10T00:00:00.000Z');
    expect(row.weekly_target).toBe(5);
    expect(row.frequency_kind).toBe('fixed');
    expect(row.total).toBe(9);
  });
});
