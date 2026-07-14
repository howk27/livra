// PL-4 (M5): ephemeral store for the post-log voice line. Not persisted — a
// voice line is a moment, not data. The increment path (hooks/useCounters)
// calls evaluatePostLog after a successful persist; VoiceLine components
// register as surfaces and render whatever lands here.
import { create } from 'zustand';
import { currentWeekDates } from '../lib/features';
import { evaluatePostLogVoice } from '../lib/moments/postLogVoice';
import type { Moment, MomentType } from '../lib/moments/types';
import { useMarksStore } from './countersSlice';
import { useEventsStore } from './eventsSlice';
import { useGoalsStore } from './goalsSlice';
import { effectivePersonalBest, useMomentumStore } from './momentumSlice';

export type VoiceLineData = {
  /** Monotonic-enough restart key: a new line re-runs the entrance animation. */
  key: number;
  text: string;
  momentId: string;
};

interface VoiceState {
  /** The line currently on screen, null when Livra is quiet (the default). */
  line: VoiceLineData | null;
  /** Mounted+focused VoiceLine surfaces. 0 → the engine is never consulted,
   *  so `voice_line_shown` analytics can never claim a line nobody saw. */
  surfaceCount: number;
  /** Caller-held anti-repeat state for the engine (last id per moment type). */
  lastMomentIds: Partial<Record<MomentType, string>>;
  /** Registers a rendering surface; returns the unregister cleanup. */
  registerSurface: () => () => void;
  clearLine: () => void;
  speak: (moment: Moment) => void;
  /**
   * Builds context from live stores and asks the engine for a post-log line.
   * Returns true when a line was shown — the analytics property's source of truth.
   * Call ONLY after a successful increment.
   */
  evaluatePostLog: (
    markId: string,
    todayStr: string,
    firstName?: string | null,
    rng?: () => number,
  ) => boolean;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  line: null,
  surfaceCount: 0,
  lastMomentIds: {},

  registerSurface: () => {
    set((s) => ({ surfaceCount: s.surfaceCount + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ surfaceCount: Math.max(0, s.surfaceCount - 1) }));
    };
  },

  clearLine: () => set({ line: null }),

  speak: (moment) =>
    set((s) => ({
      line: { key: Date.now(), text: moment.text, momentId: moment.id },
      lastMomentIds: { ...s.lastMomentIds, [moment.type]: moment.id },
    })),

  evaluatePostLog: (markId, todayStr, firstName, rng) => {
    if (get().surfaceCount <= 0) return false;

    const marks = useMarksStore.getState().marks;
    const events = useEventsStore.getState().events;
    const goals = useGoalsStore.getState().goals;
    const { snapshots, longestRuns } = useMomentumStore.getState();

    const moment = evaluatePostLogVoice({
      markId,
      todayStr,
      weekDates: currentWeekDates(),
      firstName: firstName ?? null,
      marks,
      events,
      goals,
      snapshots,
      personalBestRuns: Object.fromEntries(
        goals.map((g) => [g.id, effectivePersonalBest(longestRuns[g.id], todayStr)]),
      ),
      lastMomentIds: get().lastMomentIds,
      rng,
    });

    if (!moment) return false;
    get().speak(moment);
    return true;
  },
}));
