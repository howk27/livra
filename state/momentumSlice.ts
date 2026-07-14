import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MomentumSnapshot } from '../lib/goalMomentum';
import { addDays, formatDate, parseISO, yyyyMmDd } from '../lib/date';

// ── Longest-run tracking (PL-2, spec M2) ─────────────────────────────────────
// Forward-only personal best per goal. Initializes at the current run on the
// first evaluation after ship; never reconstructs history, never regresses.
// Persisted to AsyncStorage (same best-effort pattern as lib/goalMomentumStore);
// no schema/server change.

export type LongestRunEntry = {
  /** All-time longest run observed (forward-only). */
  best: number;
  /** Best before the run currently holding the record began. */
  priorBest: number;
  /** Day the record run first exceeded priorBest (the celebration day), else null. */
  recordDay: string | null;
  /** Start date of the run holding the record; tells a continuing run from a new one. */
  recordRunStart: string | null;
};

const LONGEST_RUNS_KEY = '@livra_longest_runs_v1';

/** Start date of a run that is `runDays` long on `todayStr` (inclusive count). */
export function runStartOf(runDays: number, todayStr: string): string {
  return formatDate(addDays(parseISO(todayStr), 1 - runDays));
}

/**
 * Pure transition for a goal's longest-run entry. Returns the previous entry
 * unchanged when nothing advances (never regresses).
 * - First observation of a positive run initializes best = priorBest = run with
 *   no recordDay: the init run is never celebrated as a record (we have no
 *   history to compare it against).
 * - A run exceeding best raises it. Only the FIRST day a NEW run overtakes the
 *   old best gets a recordDay; the same run continuing past its own record
 *   stays quiet (spec M2: one line, that day, then quiet again).
 */
export function nextLongestRun(
  prev: LongestRunEntry | undefined,
  runDays: number,
  todayStr: string,
): LongestRunEntry | undefined {
  if (runDays <= 0) return prev;
  const start = runStartOf(runDays, todayStr);
  if (!prev) {
    return { best: runDays, priorBest: runDays, recordDay: null, recordRunStart: start };
  }
  if (runDays <= prev.best) return prev;
  if (prev.recordRunStart === start) {
    // The record-holding run is still going; keep its original recordDay.
    return { ...prev, best: runDays };
  }
  return { best: runDays, priorBest: prev.best, recordDay: todayStr, recordRunStart: start };
}

/**
 * The personal best a celebration should compare against today.
 * On the record day itself the prior best is exposed, so the run reads as
 * exceeding it (isNewBest true, that day only); every other day the current
 * best is exposed and the run can never exceed it.
 */
export function effectivePersonalBest(
  entry: LongestRunEntry | undefined,
  todayStr: string,
): number | null {
  if (!entry) return null;
  return entry.recordDay === todayStr ? entry.priorBest : entry.best;
}

function persistLongestRuns(runs: Record<string, LongestRunEntry>): void {
  AsyncStorage.setItem(LONGEST_RUNS_KEY, JSON.stringify(runs)).catch(() => {
    // best effort; the map re-initializes forward-only from live runs
  });
}

function isLongestRunEntry(v: unknown): v is LongestRunEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.best === 'number' && typeof e.priorBest === 'number';
}

interface MomentumState {
  /** Latest computed Momentum snapshot per goalId (in-memory cache; recomputed on log/foreground/mount). */
  snapshots: Record<string, MomentumSnapshot>;
  /** Per-goal longest run, forward-only (PL-2). AsyncStorage-backed via hydrate/persist. */
  longestRuns: Record<string, LongestRunEntry>;
  longestRunsHydrated: boolean;
  setSnapshot: (goalId: string, snap: MomentumSnapshot, todayStr?: string) => void;
  clearSnapshot: (goalId: string) => void;
  /** Loads persisted longest runs once; replays any runs observed before hydration. */
  hydrateLongestRuns: () => Promise<void>;
}

export const useMomentumStore = create<MomentumState>((set, get) => ({
  snapshots: {},
  longestRuns: {},
  longestRunsHydrated: false,
  setSnapshot: (goalId, snap, todayStr) => {
    const today = todayStr ?? yyyyMmDd(new Date());
    const runDays = snap.state === 'broken' ? 0 : Math.max(0, snap.days);
    set((s) => {
      const nextEntry = nextLongestRun(s.longestRuns[goalId], runDays, today);
      const longestRuns =
        nextEntry && nextEntry !== s.longestRuns[goalId]
          ? { ...s.longestRuns, [goalId]: nextEntry }
          : s.longestRuns;
      // Before hydration resolves, hold writes in memory only: persisting now
      // would clobber the stored history hydrate is about to merge against.
      if (longestRuns !== s.longestRuns && s.longestRunsHydrated) persistLongestRuns(longestRuns);
      return { snapshots: { ...s.snapshots, [goalId]: snap }, longestRuns };
    });
  },
  clearSnapshot: (goalId) =>
    set((s) => {
      const next = { ...s.snapshots };
      delete next[goalId];
      return { snapshots: next };
    }),
  hydrateLongestRuns: async () => {
    if (get().longestRunsHydrated) return;
    let stored: Record<string, LongestRunEntry> = {};
    try {
      const raw = await AsyncStorage.getItem(LONGEST_RUNS_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [goalId, entry] of Object.entries(parsed as Record<string, unknown>)) {
            if (isLongestRunEntry(entry)) stored[goalId] = entry;
          }
        }
      }
    } catch {
      stored = {};
    }
    const today = yyyyMmDd(new Date());
    set((s) => {
      if (s.longestRunsHydrated) return s;
      // Replay runs observed before hydration resolved, so a pre-hydration init
      // still registers as a record against the stored history.
      const merged = { ...stored };
      for (const [goalId, memEntry] of Object.entries(s.longestRuns)) {
        merged[goalId] = nextLongestRun(merged[goalId], memEntry.best, today) ?? memEntry;
      }
      persistLongestRuns(merged);
      return { ...s, longestRuns: merged, longestRunsHydrated: true };
    });
  },
}));
