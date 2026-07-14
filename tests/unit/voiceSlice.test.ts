// PL-4: voice slice — surface gating (analytics truth) + engine wiring from live stores.
import { formatDate } from '../../lib/date';
import { getAppDate } from '../../lib/appDate';
import { maybeShowPostLogVoice, type PostLogVoiceEvaluator } from '../../lib/moments/postLogVoice';
import { useVoiceStore } from '../../state/voiceSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useEventsStore } from '../../state/eventsSlice';
import { useGoalsStore } from '../../state/goalsSlice';
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

beforeEach(() => {
  useVoiceStore.setState({ line: null, surfaceCount: 0, lastMomentIds: {} });
  useMarksStore.setState({ marks: [mark] });
  useEventsStore.setState({ events: [eventToday] });
  useGoalsStore.setState({ goals: [] });
  useMomentumStore.setState({ snapshots: {}, longestRuns: {}, longestRunsHydrated: true });
});

describe('voiceSlice.evaluatePostLog', () => {
  it('returns false and stays silent when no surface is registered', () => {
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, 'Dei', speak);
    expect(shown).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('shows a line when a surface is registered and the engine speaks', () => {
    useVoiceStore.getState().registerSurface();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, 'Dei', speak);
    expect(shown).toBe(true);
    const line = useVoiceStore.getState().line;
    expect(line).not.toBeNull();
    expect(line!.text.length).toBeGreaterThan(0);
    // Anti-repeat state is held by the slice (getMomentumBannerCopy pattern).
    expect(useVoiceStore.getState().lastMomentIds.postLog).toBe(line!.momentId);
  });

  it('returns false and shows nothing when the gate stays closed', () => {
    useVoiceStore.getState().registerSurface();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, 'Dei', silent);
    expect(shown).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('goes quiet again after the surface unregisters', () => {
    const release = useVoiceStore.getState().registerSurface();
    release();
    const shown = useVoiceStore.getState().evaluatePostLog('m1', todayStr, 'Dei', speak);
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
    useVoiceStore.getState().evaluatePostLog('m1', todayStr, 'Dei', speak);
    useVoiceStore.getState().clearLine();
    expect(useVoiceStore.getState().line).toBeNull();
  });
});

describe('maybeShowPostLogVoice (the increment path seam — analytics both ways)', () => {
  // The evaluator is injected at the call site (useCounters passes the slice
  // action) so lib/moments stays store-free; tests inject the same action.
  const evaluate: PostLogVoiceEvaluator = (id, day, name, rng) =>
    useVoiceStore.getState().evaluatePostLog(id, day, name, rng);

  it('returns true and shows the line when the engine speaks', () => {
    useVoiceStore.getState().registerSurface();
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', evaluate, speak)).toBe(true);
    expect(useVoiceStore.getState().line).not.toBeNull();
  });

  it('returns false when the gate stays closed', () => {
    useVoiceStore.getState().registerSurface();
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', evaluate, silent)).toBe(false);
    expect(useVoiceStore.getState().line).toBeNull();
  });

  it('never throws: an evaluation failure returns false so mark_logged still fires', () => {
    const throwing = () => {
      throw new Error('boom');
    };
    expect(maybeShowPostLogVoice('m1', todayStr, 'Dei', throwing, speak)).toBe(false);
  });
});
