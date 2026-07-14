// PL-2: forward-only longest-run tracking in the momentum slice.
// Personal bests initialize at the current run, advance with it, never regress,
// and expose the prior best only on the record day (so M2 fires once, that day only).
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  effectivePersonalBest,
  nextLongestRun,
  runStartOf,
  useMomentumStore,
  type LongestRunEntry,
} from '../../state/momentumSlice';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const KEY = '@livra_longest_runs_v1';

function snap(overrides: Partial<MomentumSnapshot> = {}): MomentumSnapshot {
  return { state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...overrides };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useMomentumStore.setState({ snapshots: {}, longestRuns: {}, longestRunsHydrated: false });
});

describe('runStartOf', () => {
  it('derives the inclusive start date of a run', () => {
    expect(runStartOf(1, '2026-07-14')).toBe('2026-07-14');
    expect(runStartOf(5, '2026-07-14')).toBe('2026-07-10');
  });
});

describe('nextLongestRun (pure transition)', () => {
  it('initializes at the current run with no record day (init run never celebrates)', () => {
    const e = nextLongestRun(undefined, 5, '2026-07-14')!;
    expect(e.best).toBe(5);
    expect(e.priorBest).toBe(5);
    expect(e.recordDay).toBeNull();
    expect(e.recordRunStart).toBe('2026-07-10');
  });

  it('ignores a zero or broken run with no prior entry', () => {
    expect(nextLongestRun(undefined, 0, '2026-07-14')).toBeUndefined();
  });

  it('advances best when the init run continues, without ever setting a record day', () => {
    const day1 = nextLongestRun(undefined, 5, '2026-07-14')!;
    const day2 = nextLongestRun(day1, 6, '2026-07-15')!;
    expect(day2.best).toBe(6);
    expect(day2.priorBest).toBe(5);
    expect(day2.recordDay).toBeNull(); // same run that initialized: no history beaten
  });

  it('never regresses when the run breaks or a shorter run follows', () => {
    const e = nextLongestRun(undefined, 9, '2026-07-14')!;
    expect(nextLongestRun(e, 0, '2026-07-15')).toBe(e);
    expect(nextLongestRun(e, 3, '2026-07-20')).toBe(e);
    expect(nextLongestRun(e, 9, '2026-07-25')).toBe(e); // equal is not a new best
  });

  it('a NEW run overtaking the old best gets a record day, once', () => {
    const oldBest = nextLongestRun(undefined, 8, '2026-07-01')!;
    // run broke; a fresh run reaches 9 on 2026-07-20 (started 2026-07-12)
    const record = nextLongestRun(oldBest, 9, '2026-07-20')!;
    expect(record.best).toBe(9);
    expect(record.priorBest).toBe(8);
    expect(record.recordDay).toBe('2026-07-20');
    expect(record.recordRunStart).toBe('2026-07-12');
    // the same run continuing past its own record stays quiet
    const next = nextLongestRun(record, 10, '2026-07-21')!;
    expect(next.best).toBe(10);
    expect(next.priorBest).toBe(8);
    expect(next.recordDay).toBe('2026-07-20'); // unchanged: celebration day stays in the past
  });
});

describe('effectivePersonalBest (that-day-only exposure)', () => {
  const entry: LongestRunEntry = {
    best: 9,
    priorBest: 8,
    recordDay: '2026-07-20',
    recordRunStart: '2026-07-12',
  };

  it('exposes the prior best on the record day, so the run reads as a new best', () => {
    expect(effectivePersonalBest(entry, '2026-07-20')).toBe(8);
  });

  it('exposes the current best on every other day, so the run can never exceed it', () => {
    expect(effectivePersonalBest(entry, '2026-07-21')).toBe(9);
  });

  it('is null with no entry (no recorded history yet)', () => {
    expect(effectivePersonalBest(undefined, '2026-07-20')).toBeNull();
  });
});

describe('setSnapshot longest-run integration (the momentum evaluation write path)', () => {
  it('initializes and advances longest_run as the run-day count advances', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 3 }), '2026-07-14');
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(3);
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 4 }), '2026-07-15');
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(4);
  });

  it('never regresses on a broken snapshot', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 6 }), '2026-07-14');
    useMomentumStore.getState().setSnapshot('g1', snap({ state: 'broken', days: 6 }), '2026-07-16');
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(6);
  });

  it('persists the map to AsyncStorage on change, once hydrated', async () => {
    await useMomentumStore.getState().hydrateLongestRuns();
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 3 }), '2026-07-14');
    const raw = await AsyncStorage.getItem(KEY);
    expect(JSON.parse(raw!).g1.best).toBe(3);
  });

  it('holds pre-hydration writes in memory without touching stored history', async () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 3 }), '2026-07-14');
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(3);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

describe('hydrateLongestRuns', () => {
  it('loads a persisted map once', async () => {
    const stored = {
      g1: { best: 12, priorBest: 12, recordDay: null, recordRunStart: '2026-07-01' },
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
    await useMomentumStore.getState().hydrateLongestRuns();
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(12);
    expect(useMomentumStore.getState().longestRunsHydrated).toBe(true);
  });

  it('replays a pre-hydration run against stored history instead of clobbering it', async () => {
    const stored = {
      g1: { best: 20, priorBest: 20, recordDay: null, recordRunStart: '2026-06-01' },
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
    // an eval landed before hydration resolved
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 5 }));
    await useMomentumStore.getState().hydrateLongestRuns();
    expect(useMomentumStore.getState().longestRuns.g1.best).toBe(20); // stored history wins
  });

  it('tolerates corrupt storage (starts empty, forward-only)', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    await useMomentumStore.getState().hydrateLongestRuns();
    expect(useMomentumStore.getState().longestRuns).toEqual({});
    expect(useMomentumStore.getState().longestRunsHydrated).toBe(true);
  });
});
