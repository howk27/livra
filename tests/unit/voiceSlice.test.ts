// PL-4: voice slice — surface gating (analytics truth) + engine wiring.
// M9 Phase 5A Task 6: the account data is an explicit INPUT to evaluatePostLog
// (the caller reads the query cache); these tests pass it directly.
import { addDays, formatDate, parseISO, yyyyMmDd } from '../../lib/date';
import { getAppDate } from '../../lib/appDate';
import {
  maybeShowPostLogVoice,
  type PostLogVoiceData,
  type PostLogVoiceEvaluator,
} from '../../lib/moments/postLogVoice';
import { useVoiceStore } from '../../state/voiceSlice';
import { useIdentityStore } from '../../state/identitySlice';
import { useMomentumStore } from '../../state/momentumSlice';
import type { Mark, MarkEvent } from '../../types';

const speak = () => 0;
const silent = () => 0.9;

const todayStr = formatDate(getAppDate());

const mark: Mark = {
  id: 'm1',
  user_id: 'u1',
  name: 'Read',
  unit: 'sessions',
  enable_streak: false,
  sort_index: 0,
  total: 2,
  created_at: '2026-06-01T08:00:00Z',
  updated_at: '2026-06-01T08:00:00Z',
  weekly_target: 3,
  dailyTarget: 1,
} as Mark;

const eventToday: MarkEvent = {
  id: 'e1',
  user_id: 'u1',
  mark_id: 'm1',
  event_type: 'increment',
  amount: 1,
  occurred_at: new Date().toISOString(),
  occurred_local_date: todayStr,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as MarkEvent;

// Task 4: a lone lifetime event IS the account's very first-ever log, which
// now bypasses the postLog gate entirely (accountFirstVariant 'firstEver').
// A second event 2 days back keeps these generic gate tests generic: recent
// enough to stay under the 3-day comeback threshold, but not "yesterday" or
// "exactly 6 days back" so it does not accidentally read as dayTwoReturn/weekOne.
const twoDaysAgo = yyyyMmDd(addDays(parseISO(todayStr), -2));
const eventTwoDaysAgo: MarkEvent = {
  id: 'e0',
  user_id: 'u1',
  mark_id: 'm1',
  event_type: 'increment',
  amount: 1,
  occurred_at: `${twoDaysAgo}T10:00:00.000Z`,
  occurred_local_date: twoDaysAgo,
  created_at: `${twoDaysAgo}T10:00:00.000Z`,
  updated_at: `${twoDaysAgo}T10:00:00.000Z`,
} as MarkEvent;

const baseData: PostLogVoiceData = {
  marks: [mark],
  events: [eventToday, eventTwoDaysAgo],
  goals: [],
};

beforeEach(() => {
  useVoiceStore.setState({ line: null, surfaceCount: 0, lastMomentIds: {} });
  useMomentumStore.setState({ snapshots: {}, longestRuns: {}, longestRunsHydrated: true });
});

describe('voiceSlice.evaluatePostLog', () => {
  it('returns false and stays silent when no surface is registered', () => {
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, baseData, 'Dei', speak);
    expect(shown).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('shows a line when a surface is registered and the engine speaks', () => {
    useVoiceStore.getState().registerSurface();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, baseData, 'Dei', speak);
    expect(shown).toBe(true);
    const line = useVoiceStore.getState().line;
    expect(line).not.toBeNull();
    expect(line!.text.length).toBeGreaterThan(0);
    // Anti-repeat state is held by the slice (getMomentumBannerCopy pattern).
    expect(useVoiceStore.getState().lastMomentIds.postLog).toBe(line!.momentId);
  });

  it('returns false and shows nothing when the gate stays closed', () => {
    useVoiceStore.getState().registerSurface();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, baseData, 'Dei', silent);
    expect(shown).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('goes quiet again after the surface unregisters', () => {
    const release = useVoiceStore.getState().registerSurface();
    release();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, baseData, 'Dei', speak);
    expect(shown).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('unregister is idempotent (double-release never goes negative)', () => {
    const release = useVoiceStore.getState().registerSurface();
    useVoiceStore.getState().registerSurface();
    release();
    release();
    expect(useVoiceStore.getState().surfaceCount).toBe(1);
  });

  it('clearLine removes the line', () => {
    useVoiceStore.getState().registerSurface();
    useVoiceStore.getState().evaluatePostLog('m1', todayStr, baseData, 'Dei', speak);
    useVoiceStore.getState().clearLine();
    expect(useVoiceStore.getState().line).toBeNull();
  });
});

describe('identity glue — the fired memory is an input, not an after-filter', () => {
  // 11 daily logs ending today: account older than the first-week window, no
  // comeback gap, total past fact-10 and short of the identity bar. The 10th
  // log is the one that "crossed" — these tests are about the 11th.
  const dailyLedger = Array.from({ length: 11 }, (_, i) => {
    const date = yyyyMmDd(addDays(parseISO(todayStr), -(10 - i)));
    return {
      id: `d${i}`,
      user_id: 'u1',
      mark_id: 'm1',
      event_type: 'increment',
      amount: 1,
      occurred_at: `${date}T10:00:00.000Z`,
      occurred_local_date: date,
      created_at: `${date}T10:00:00.000Z`,
      updated_at: `${date}T10:00:00.000Z`,
    } as MarkEvent;
  });

  const ledgerData: PostLogVoiceData = { ...baseData, events: dailyLedger };

  beforeEach(() => {
    useIdentityStore.setState({ fired: {}, loaded: true });
  });

  it('records the milestone that was actually spoken', () => {
    useVoiceStore.getState().registerSurface();
    expect(useVoiceStore.getState().evaluatePostLog('m1', todayStr, ledgerData, 'Dei', speak)).toBe(
      true,
    );
    expect(useIdentityStore.getState().firedFor('m1')).toEqual(['fact-10']);
  });

  it('records NOTHING when no surface was there to say it', () => {
    expect(useVoiceStore.getState().evaluatePostLog('m1', todayStr, ledgerData, 'Dei', speak)).toBe(
      false,
    );
    expect(useIdentityStore.getState().firedFor('m1')).toEqual([]);
  });

  it('so the next on-surface log still says it — the milestone survives mark detail', () => {
    // The crossing log happened on a screen with no VoiceLine (returns false,
    // records nothing); the milestone is still owed on the very next log.
    expect(useVoiceStore.getState().evaluatePostLog('m1', todayStr, ledgerData, 'Dei', speak)).toBe(
      false,
    );
    useVoiceStore.getState().registerSurface();
    expect(useVoiceStore.getState().evaluatePostLog('m1', todayStr, ledgerData, 'Dei', speak)).toBe(
      true,
    );
    expect(useIdentityStore.getState().firedFor('m1')).toEqual(['fact-10']);
  });

  it('does not say it twice once it is recorded', () => {
    useIdentityStore.setState({ fired: { m1: ['fact-10'] } });
    useVoiceStore.getState().registerSurface();
    useVoiceStore.getState().evaluatePostLog('m1', todayStr, ledgerData, 'Dei', speak);
    expect(useIdentityStore.getState().firedFor('m1')).toEqual(['fact-10']);
    // Whatever Livra says next, it is not the milestone line again.
    expect(useVoiceStore.getState().line?.momentId ?? '').not.toContain('identity');
  });
});

describe('maybeShowPostLogVoice (the increment path seam — analytics both ways)', () => {
  // The evaluator is injected at the call site (useCheckin passes the slice
  // action) so lib/moments stays store-free; tests inject the same action.
  const evaluate: PostLogVoiceEvaluator = (id, day, data, name, rng) =>
    useVoiceStore.getState().evaluatePostLog(id, day, data, name, rng);

  it('returns true and shows the line when the engine speaks', () => {
    useVoiceStore.getState().registerSurface();
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', baseData, evaluate, speak)).toBe(true);
    expect(useVoiceStore.getState().line).not.toBeNull();
  });

  it('returns false when the gate stays closed', () => {
    useVoiceStore.getState().registerSurface();
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', baseData, evaluate, silent)).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('never throws: an evaluation failure returns false so mark_logged still fires', () => {
    const throwing = () => {
      throw new Error('boom');
    };
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', baseData, throwing, speak)).toBe(false);
  });
});
