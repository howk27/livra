// One-off backfill so ALREADY-BROKEN accounts heal.
//
// marks.goal_id is pushed and pulled now, but push only sends rows newer than
// the push cursor — a mark created before the M6 fix and never edited since has
// never been pushed with its goal_id, so the server column is still NULL and
// goalsReconcile has no source after a reinstall. Re-stamping updated_at makes
// the next push carry it. Idempotent, non-fatal, tombstone-safe.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backfillGoalIdPushStamp } from '../../lib/db';

const BACKFILL_FLAG = '@livra_backfill_goal_id_push_v1';
const MARKS_KEY = '@livra_db_marks';

const readMarks = async (): Promise<any[]> => JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('backfillGoalIdPushStamp', () => {
  it('re-stamps updated_at on marks that carry a goal_id', async () => {
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([
        { id: 'a', goal_id: 'g1', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
        { id: 'b', goal_id: 'g1', updated_at: '2026-01-02T00:00:00.000Z', deleted_at: null },
      ]),
    );

    const result = await backfillGoalIdPushStamp();

    expect(result).toEqual({ stamped: 2, skipped: null });
    const marks = await readMarks();
    for (const mark of marks) {
      expect(new Date(mark.updated_at).getTime()).toBeGreaterThan(
        new Date('2026-01-02T00:00:00.000Z').getTime(),
      );
    }
  });

  it('re-stamps live marks that have NO goal_id — they carry the frequency columns too', async () => {
    // A goal_id-only predicate would skip standalone habits AND every mark of a
    // completed goal, because convertMarksToMaintenance nulls goal_id on those.
    // Those are exactly the marks that come back as daily habits after a reinstall.
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([
        { id: 'a', goal_id: null, updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'b', updated_at: '2026-01-01T00:00:00.000Z' },
        { id: 'c', goal_id: '   ', updated_at: '2026-01-01T00:00:00.000Z' },
      ]),
    );

    const result = await backfillGoalIdPushStamp();

    expect(result.stamped).toBe(3);
    const marks = await readMarks();
    for (const mark of marks) {
      expect(new Date(mark.updated_at).getTime()).toBeGreaterThan(
        new Date('2026-01-01T00:00:00.000Z').getTime(),
      );
    }
  });

  it('never re-stamps a tombstoned mark (would risk resurrecting it)', async () => {
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([
        {
          id: 'dead',
          goal_id: 'g1',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: '2026-01-05T00:00:00.000Z',
        },
        { id: 'alive', goal_id: 'g1', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null },
      ]),
    );

    const result = await backfillGoalIdPushStamp();

    expect(result.stamped).toBe(1);
    const marks = await readMarks();
    expect(marks.find((m) => m.id === 'dead').updated_at).toBe('2026-01-01T00:00:00.000Z');
    expect(marks.find((m) => m.id === 'alive').updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('is idempotent — a second run does nothing', async () => {
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([{ id: 'a', goal_id: 'g1', updated_at: '2026-01-01T00:00:00.000Z' }]),
    );

    await backfillGoalIdPushStamp();
    const afterFirst = await AsyncStorage.getItem(MARKS_KEY);

    const second = await backfillGoalIdPushStamp();

    expect(second).toEqual({ stamped: 0, skipped: 'already-run' });
    expect(await AsyncStorage.getItem(MARKS_KEY)).toBe(afterFirst);
  });

  it('sets the flag once it has run so it never fires again', async () => {
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([{ id: 'a', goal_id: 'g1', updated_at: '2026-01-01T00:00:00.000Z' }]),
    );

    await backfillGoalIdPushStamp();

    expect(await AsyncStorage.getItem(BACKFILL_FLAG)).toBe('1');
  });

  it('does not fire on a device with no local marks, and does NOT claim the flag', async () => {
    const result = await backfillGoalIdPushStamp();

    expect(result).toEqual({ stamped: 0, skipped: 'no-marks' });
    expect(await AsyncStorage.getItem(BACKFILL_FLAG)).toBeNull();
  });

  it('treats an empty mark array the same as a fresh install', async () => {
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify([]));

    const result = await backfillGoalIdPushStamp();

    expect(result).toEqual({ stamped: 0, skipped: 'no-marks' });
    expect(await AsyncStorage.getItem(BACKFILL_FLAG)).toBeNull();
  });

  it('still claims the flag when marks exist but none carry a goal_id', async () => {
    await AsyncStorage.setItem(
      MARKS_KEY,
      JSON.stringify([{ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' }]),
    );

    await backfillGoalIdPushStamp();

    expect(await AsyncStorage.getItem(BACKFILL_FLAG)).toBe('1');
  });

  it('is non-fatal when stored marks are corrupt', async () => {
    await AsyncStorage.setItem(MARKS_KEY, 'not json');

    await expect(backfillGoalIdPushStamp()).resolves.toEqual({ stamped: 0, skipped: 'error' });
  });
});
