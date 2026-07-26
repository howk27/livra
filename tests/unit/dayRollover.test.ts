import { useAppDateStore, selectAppDateKey, type AppDateState } from '../../state/appDateSlice';

/**
 * The app-date key is what every "today" computation is memoised against —
 * Focus, the goal screen, mark detail, MarkCard, badges, counters, streaks.
 *
 * It used to be `debugDateOverride ?? ''`, which in production is the constant
 * empty string. A `useMemo` keyed on a constant runs once, so a screen open
 * across midnight kept yesterday's counts, kept offering a mark already logged
 * "today", and kept a momentum banner for a day that had ended. Nothing was
 * wrong in those screens; the key simply never changed.
 */
const KEY_UNDER_TEST = (over: Partial<AppDateState> = {}) =>
  selectAppDateKey({ ...useAppDateStore.getState(), ...over } as AppDateState);

describe('selectAppDateKey', () => {
  it('is the real day, not a constant — this is the whole fix', () => {
    expect(KEY_UNDER_TEST({ debugDateOverride: null, dayKey: '2026-07-25' })).toBe('2026-07-25');
    expect(KEY_UNDER_TEST({ debugDateOverride: null, dayKey: '2026-07-26' })).toBe('2026-07-26');
  });

  it('changes when the day turns over, so every memo keyed on it recomputes', () => {
    const before = KEY_UNDER_TEST({ debugDateOverride: null, dayKey: '2026-07-25' });
    const after = KEY_UNDER_TEST({ debugDateOverride: null, dayKey: '2026-07-26' });
    expect(before).not.toBe(after);
  });

  it('still lets the dev override win, so simulated-date debugging is unchanged', () => {
    expect(KEY_UNDER_TEST({ debugDateOverride: '2026-01-01', dayKey: '2026-07-25' })).toBe(
      '2026-01-01',
    );
  });
});

describe('refreshDayKey', () => {
  const realNow = Date.now;

  afterEach(() => {
    Date.now = realNow;
    jest.useRealTimers();
  });

  const setClock = (iso: string) => {
    jest.useFakeTimers().setSystemTime(new Date(iso));
  };

  it('reports false while the day is unchanged, so nothing downstream re-runs', () => {
    setClock('2026-07-25T14:00:00');
    useAppDateStore.getState().refreshDayKey();

    expect(useAppDateStore.getState().refreshDayKey()).toBe(false);
  });

  it('reports true exactly once when the day turns over', () => {
    setClock('2026-07-25T23:59:30');
    useAppDateStore.getState().refreshDayKey();
    expect(useAppDateStore.getState().dayKey).toBe('2026-07-25');

    setClock('2026-07-26T00:00:30');
    expect(useAppDateStore.getState().refreshDayKey()).toBe(true);
    expect(useAppDateStore.getState().dayKey).toBe('2026-07-26');

    // The rollover work must not run again on the next tick of the same day.
    expect(useAppDateStore.getState().refreshDayKey()).toBe(false);
  });

  it('follows the clock backwards too — a timezone flight or a corrected clock', () => {
    setClock('2026-07-26T01:00:00');
    useAppDateStore.getState().refreshDayKey();

    setClock('2026-07-25T22:00:00');
    expect(useAppDateStore.getState().refreshDayKey()).toBe(true);
    expect(useAppDateStore.getState().dayKey).toBe('2026-07-25');
  });

  it('reads the LOCAL day, which is the day the user is living in', () => {
    setClock('2026-07-26T00:30:00');
    useAppDateStore.getState().refreshDayKey();

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    expect(useAppDateStore.getState().dayKey).toBe(expected);
  });
});
