// Pure, deterministic moment selector (PL-1).
// Returns null when Livra should stay quiet — silence is a first-class output;
// the mentor does not fill air. Selection logic only: content comes from the registry.
import { addDays, parseISO, yyyyMmDd } from '../date';
import { fillTemplate, pickTemplate, type TemplateSlots } from './content';
import type {
  EmptySurface,
  EmptyVariant,
  GoalMomentContext,
  Moment,
  MomentContext,
  MomentType,
  Surface,
} from './types';

/** M5: roughly 1-in-3 logs get a line; the rest keep the quiet animation only. */
export const POSTLOG_SPEAK_RATE = 1 / 3;

/**
 * Deterministic rng seeded from a string (PL-3, M6). The greeting seeds it with
 * todayStr so the default rotation is stable within a day (no mid-day churn on
 * re-render) and varies across days. FNV-1a seed + xmur-style scramble.
 */
export function dayHashRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = (h ^ (h >>> 16)) >>> 0;
    if (h === 0) h = 0x9e3779b9; // never let the stream collapse to a fixed point
    return h / 4294967296;
  };
}

/**
 * M6 (PL-3): the default-greeting id yesterday's day-seeded rotation picks with
 * no exclusion. Feeding it back as lastMomentIds makes the daily rotation
 * anti-repeating with no persisted state — the whole thing stays a pure
 * function of the date, so re-renders within a day never churn the line.
 */
export function previousDayGreetingDefaultId(todayStr: string): string | undefined {
  const yesterday = yyyyMmDd(addDays(parseISO(todayStr), -1));
  return pickTemplate('greetingDefault', 'default', null, dayHashRng(yesterday))?.id;
}

/**
 * QC2-F: the rest-line counterpart of previousDayGreetingDefaultId. Seeded per
 * mark AND per day, so two done marks need not share a line, the line is stable
 * across re-renders within a day, and yesterday's base pick is excluded — the
 * same stateless anti-repeat the greeting uses.
 */
export function previousDayRestLineId(todayStr: string, markId: string): string | undefined {
  const yesterday = yyyyMmDd(addDays(parseISO(todayStr), -1));
  return pickTemplate('rest', 'doneForWeek', null, dayHashRng(`${yesterday}:${markId}`))?.id;
}

export type SelectOptions = {
  /** Injectable randomness (postLog gate + rotation) for deterministic tests. */
  rng?: () => number;
  /** Caller-held anti-repeat state: last shown Moment.id per moment type. */
  lastMomentIds?: Partial<Record<MomentType, string>>;
  /** Which goal the surface is scoped to (goalDetail; optional focus for postLog). */
  goalId?: string;
  /** M4: brand-new user vs deleted-everything. Defaults to firstRun. */
  emptyVariant?: EmptyVariant;
  /** M4 (PL-5): which empty surface is speaking. Defaults to focus. */
  emptySurface?: EmptySurface;
  /** M5 (PL-4): this log completed the mark's weekly target. Computed by the
   *  caller (evaluatePostLogVoice) — the ctx carries counts, not per-mark targets. */
  closesWeekForMark?: boolean;
  /** QC2-F: this log landed on a mark that was ALREADY done for the week (the
   *  bonus log). Caller-computed, same reason as closesWeekForMark. */
  bonusAfterWeekDone?: boolean;
  /** QC2-F: the restLine surface speaks only over a doneForWeek mark. The caller
   *  (focus.tsx showRestLine) owns the markWeeklyState check; this flag carries it. */
  markDoneForWeek?: boolean;
};

function makeMoment(
  surface: Surface,
  type: MomentType,
  variant: string,
  slots: TemplateSlots,
  opts: SelectOptions,
): Moment | null {
  const rng = opts.rng ?? Math.random;
  const picked = pickTemplate(type, variant, opts.lastMomentIds?.[type], rng);
  if (!picked) return null;
  return { id: picked.id, surface, type, text: fillTemplate(picked.template, slots) };
}

/** Slipping goals that have a why, worst cushion first — M3's audience. */
function slippingWithWhy(ctx: MomentContext): GoalMomentContext[] {
  return ctx.goals
    .filter((g) => g.isSlipping && g.hasWhy)
    .sort((a, b) => (a.cushionRemaining ?? 0) - (b.cushionRemaining ?? 0));
}

/** "No log yet on this goal" — lifetime count when the caller supplied one
 *  (PL-3), else the run-days proxy PL-1 shipped with. */
function hasNeverLogged(g: GoalMomentContext): boolean {
  if (g.lifetimeLogCount != null) return g.lifetimeLogCount === 0;
  return g.momentumRunDays === 0;
}

/** M1: which first-week story a goal has today, if any. Days 2–4 stay silent. */
function firstWeekVariant(g: GoalMomentContext): 'orientation' | 'pull' | null {
  if (!g.firstWeek) return null;
  if (g.goalAgeDays <= 1 && hasNeverLogged(g)) return 'orientation';
  if (g.goalAgeDays >= 5 && g.momentumRunDays > 0) return 'pull';
  return null;
}

/** M2: threshold day or a new personal best. */
function celebrationVariant(g: GoalMomentContext): 'threshold' | 'newBest' | null {
  if (g.isNewBest) return 'newBest';
  if (g.celebrationThreshold !== null) return 'threshold';
  return null;
}

function goalSlots(g: GoalMomentContext, ctx: MomentContext): TemplateSlots {
  return {
    name: ctx.firstName,
    goalTitle: g.goalTitle,
    why: g.why,
    runDays: g.momentumRunDays,
  };
}

// ── Per-surface selectors ─────────────────────────────────────────────────────

/** Greeting: slipping-direct > first-week (younger goal wins) > celebration > default rotation (M6). */
function selectGreeting(ctx: MomentContext, opts: SelectOptions): Moment | null {
  const slipping = slippingWithWhy(ctx)[0];
  if (slipping) {
    return makeMoment('greeting', 'whyResurface', 'direct', goalSlots(slipping, ctx), opts);
  }

  // Two week-one goals: the younger wins the greeting (one voice per surface).
  const firstWeekers = ctx.goals
    .map((g) => ({ g, variant: firstWeekVariant(g) }))
    .filter((e): e is { g: GoalMomentContext; variant: 'orientation' | 'pull' } => e.variant !== null)
    .sort((a, b) => a.g.goalAgeDays - b.g.goalAgeDays);
  const fw = firstWeekers[0];
  if (fw) {
    return makeMoment('greeting', 'firstWeek', fw.variant, goalSlots(fw.g, ctx), opts);
  }

  for (const g of ctx.goals) {
    const variant = celebrationVariant(g);
    if (variant) return makeMoment('greeting', 'celebration', variant, goalSlots(g, ctx), opts);
  }

  // M6 default rotation — the greeting always has a voice.
  return makeMoment('greeting', 'greetingDefault', 'default', { name: ctx.firstName }, opts);
}

/** Banner: M3 only. No why stored → null (the existing generic banner copy stays). */
function selectMomentumBanner(ctx: MomentContext, opts: SelectOptions): Moment | null {
  const slipping = slippingWithWhy(ctx)[0];
  if (!slipping) return null;
  return makeMoment('momentumBanner', 'whyResurface', 'direct', goalSlots(slipping, ctx), opts);
}

/** Goal detail (scoped by opts.goalId): whyResurface > celebration > first-week > silence. */
function selectGoalDetail(ctx: MomentContext, opts: SelectOptions): Moment | null {
  const g = ctx.goals.find((x) => x.goalId === opts.goalId);
  if (!g) return null;
  if (g.isSlipping && g.hasWhy) {
    return makeMoment('goalDetail', 'whyResurface', 'direct', goalSlots(g, ctx), opts);
  }
  const celebrate = celebrationVariant(g);
  if (celebrate) return makeMoment('goalDetail', 'celebration', celebrate, goalSlots(g, ctx), opts);
  const fw = firstWeekVariant(g);
  if (fw) return makeMoment('goalDetail', 'firstWeek', fw, goalSlots(g, ctx), opts);
  return null;
}

/** M5 contextual picks, walked in order — future picks are new rows, not new branches. */
type PostLogPick = {
  variant: string;
  /** Registry key the copy lives under; defaults to 'postLog'. */
  type?: MomentType;
  /** Skips the variable-ratio gate — once-ever moments never gamble away. */
  bypassGate?: boolean;
  when: (ctx: MomentContext, g: GoalMomentContext | undefined, opts: SelectOptions) => boolean;
};

const POSTLOG_PICKS: readonly PostLogPick[] = [
  // M1 (PL-3): the first-ever log on a goal is acknowledged, always — it fires
  // once per goal lifetime, so it never rides the 1-in-3 gate. Counted after
  // the log lands: lifetimeLogCount 1 IS the first log.
  {
    variant: 'firstLog',
    type: 'firstWeek',
    bypassGate: true,
    when: (_ctx, g) => g?.lifetimeLogCount === 1,
  },
  { variant: 'slippingGentle', when: (_ctx, g) => g?.isSlipping === true },
  // QC2-F: the bonus log — a mark already done for the week got logged anyway.
  // Above closesDay: once everything is done, closesDay stays true for every
  // extra log, and the rest-respecting line is the truer, more specific fact.
  // Rides the 1-in-3 gate (it can recur); NOT playful, NOT scolding.
  {
    variant: 'bonusLog',
    type: 'rest',
    when: (_ctx, _g, opts) => opts.bonusAfterWeekDone === true,
  },
  { variant: 'closesDay', when: (ctx) => ctx.allDoneForDay },
  // PL-4: the log that completes the mark's weekly target (caller-computed flag).
  { variant: 'closesWeek', when: (_ctx, _g, opts) => opts.closesWeekForMark === true },
  { variant: 'firstOfDay', when: (ctx) => ctx.logsToday === 1 },
  { variant: 'plain', when: () => true },
];

/**
 * Post-log (M5 + M1's first-log pick): variable-ratio gate first — most logs get
 * silence (the quiet animation is the default). When the gate opens, the priority
 * table above picks the contextual variant. Rows marked bypassGate speak
 * deterministically. Called AFTER the log lands, so logsToday includes it.
 */
function selectPostLog(ctx: MomentContext, opts: SelectOptions): Moment | null {
  if (ctx.logsToday <= 0) return null; // nothing was logged; nothing true to say

  const g = opts.goalId ? ctx.goals.find((x) => x.goalId === opts.goalId) : undefined;
  const pick = POSTLOG_PICKS.find((p) => p.when(ctx, g, opts))!;

  if (!pick.bypassGate) {
    const rng = opts.rng ?? Math.random;
    if (rng() >= POSTLOG_SPEAK_RATE) return null;
  }

  const slots: TemplateSlots = g ? goalSlots(g, ctx) : { name: ctx.firstName };
  return makeMoment('postLog', pick.type ?? 'postLog', pick.variant, slots, opts);
}

/** QC2-F: the rest line under a doneForWeek mark on Focus. The caller already
 *  computed markWeeklyState (the showRestLine predicate); the engine owns the
 *  words. VOICE ONLY — the Log one more affordance next to it is untouched and
 *  logging is never blocked. Silence when the mark is not done for the week. */
function selectRestLine(_ctx: MomentContext, opts: SelectOptions): Moment | null {
  if (opts.markDoneForWeek !== true) return null;
  return makeMoment('restLine', 'rest', 'doneForWeek', {}, opts);
}

/** Empty states (M4, PL-5): static invitations keyed per surface; emptiness itself
 *  is the true thing to speak about. Two-line surfaces (goals) resolve to their
 *  `.body` line here — screens that need the title use getEmptyStateCopy. */
function selectEmptyState(ctx: MomentContext, opts: SelectOptions): Moment | null {
  const surface: EmptySurface = opts.emptySurface ?? 'focus';
  const variant: EmptyVariant = opts.emptyVariant ?? 'firstRun';
  const slots = { name: ctx.firstName };
  return (
    makeMoment('emptyState', 'emptyInvitation', `${surface}.${variant}`, slots, opts) ??
    makeMoment('emptyState', 'emptyInvitation', `${surface}.${variant}.body`, slots, opts) ??
    // Inherently-firstRun surfaces (history, markDetail) answer any variant.
    makeMoment('emptyState', 'emptyInvitation', `${surface}.firstRun`, slots, opts)
  );
}

/**
 * The engine's single entry point. Pure and deterministic given (surface, ctx, opts);
 * all randomness flows through opts.rng.
 */
export function selectMoment(
  surface: Surface,
  ctx: MomentContext,
  opts: SelectOptions = {},
): Moment | null {
  switch (surface) {
    case 'greeting':
      return selectGreeting(ctx, opts);
    case 'momentumBanner':
      return selectMomentumBanner(ctx, opts);
    case 'goalDetail':
      return selectGoalDetail(ctx, opts);
    case 'postLog':
      return selectPostLog(ctx, opts);
    case 'emptyState':
      return selectEmptyState(ctx, opts);
    case 'restLine':
      return selectRestLine(ctx, opts);
    default:
      return null;
  }
}
