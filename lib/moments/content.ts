// The registry: every line Livra can say, keyed by moment type + variant (PL-1 skeleton).
// Copy is data: adding a future moment means adding entries, not logic.
// Rotation follows lib/copy.ts getMomentumBannerCopy: the CALLER holds the last id;
// the engine stays pure. Copy rules: no dash-as-dash, middle dot separator,
// no exclamation marks, no guilt or loss language (Jest walks this registry).
import type { MomentType } from './types';

/** Named sub-variants per moment type. Selection logic picks the variant; this file owns the words. */
export const MOMENT_CONTENT: Record<MomentType, Record<string, readonly string[]>> = {
  // interim copy, replaced in PL-6
  firstWeek: {
    orientation: ['Day one of {goalTitle}. One mark is a start.'],
    pull: ['Almost through week one of {goalTitle}. It counts double, psychologically.'],
    // M1 first-ever log acknowledgment; renders on the postLog surface (PL-4).
    firstLog: [
      'First mark on {goalTitle}. It is real now.',
      'That is the first one on {goalTitle}. Noted.',
    ],
  },
  // interim copy, replaced in PL-6
  celebration: {
    threshold: ['{runDays} days on {goalTitle}. Quietly impressive.'],
    newBest: ['{runDays} days on {goalTitle}. Your longest yet.'],
  },
  // interim copy, replaced in PL-6
  whyResurface: {
    direct: ["You wrote: '{why}'. One check-in keeps it alive."],
  },
  // M4 (PL-5): final copy, keyed `${surface}.${variant}` (plus `.title`/`.body`
  // where the surface renders two lines). One static line per key: emptiness
  // does not rotate. firstRun = brand-new user; returnedEmpty = cleared it out.
  // history and markDetail are inherently firstRun (a completed goal cannot
  // un-complete; a mark with no logs has no past), so they carry one variant.
  emptyInvitation: {
    'focus.firstRun': ['Quiet in here. Tap + and give day one its first mark.'],
    'focus.returnedEmpty': [
      'Everything cleared. When you are ready, tap + and start with one small mark.',
    ],
    'goals.firstRun.title': ['Room for one goal.'],
    'goals.firstRun.body': ['Name the thing you keep meaning to do. One is plenty.'],
    'goals.returnedEmpty.title': ['A clear field.'],
    'goals.returnedEmpty.body': ['The old goals are gone. The next one gets a clean start.'],
    'goals.completedAll.title': ['You finished everything.'],
    'goals.completedAll.body': [
      'Take the win. The next goal can wait until it matters enough to name.',
    ],
    'goalDetail.firstRun': ['A goal without marks is a wish. Add the first one and make it a practice.'],
    'goalDetail.returnedEmpty': [
      'No marks on this goal right now. Give it one way forward and it moves again.',
    ],
    'history.firstRun': [
      'Empty, for now. Finish a goal and it will be sitting here, done, with the date to prove it.',
    ],
    'markDetail.firstRun': ['No history yet. The first log starts the record.'],
  },
  // interim copy, replaced in PL-6
  postLog: {
    firstOfDay: ['First mark of the day. The rest comes easier.'],
    closesDay: ['That is everything for today. Well held.'],
    closesWeek: [
      'That one is settled for the week. Extras still count.',
      'Week complete on that one. More is welcome, not required.',
    ],
    slippingGentle: ['Good. That one mattered.'],
    plain: ['Logged. Small and real.', 'Noted. It adds up quietly.'],
  },
  // interim copy, replaced in PL-6. M6: the former static Focus greeting pool,
  // now the default rotation for the greeting surface ({name} slot, anti-repeat).
  greetingDefault: {
    default: [
      '{name}, one step is enough.',
      '{name}, small steps still count.',
      '{name}, today asks for one mark, not a plan.',
    ],
  },
};

export type TemplateSlots = {
  name?: string | null;
  goalTitle?: string | null;
  why?: string | null;
  runDays?: number | null;
  remaining?: number | null;
};

export const WHY_MAX_CHARS = 80;

/** Truncates a why to <= max chars, ellipsis included. */
export function truncateWhy(why: string, max: number = WHY_MAX_CHARS): string {
  const t = why.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1).trimEnd();
  return head + '…';
}

/**
 * Fills template slots. Name-absent is graceful: "{name}, one step" → "One step".
 * The why is truncated to 80 chars.
 */
export function fillTemplate(template: string, slots: TemplateSlots): string {
  let out = template;
  const name = slots.name?.trim();
  if (name) {
    out = out.replace(/\{name\}/g, name);
  } else {
    out = out.replace(/\{name\},\s*/g, '').replace(/\{name\}\s*/g, '');
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  out = out.replace(/\{goalTitle\}/g, slots.goalTitle?.trim() || 'your goal');
  out = out.replace(/\{why\}/g, slots.why ? truncateWhy(slots.why) : '');
  out = out.replace(/\{runDays\}/g, slots.runDays != null ? String(slots.runDays) : '');
  out = out.replace(/\{remaining\}/g, slots.remaining != null ? String(slots.remaining) : '');
  return out;
}

export type PickedTemplate = {
  /** Stable per template: `${type}.${variant}.${index}`. Caller stores it for anti-repeat. */
  id: string;
  template: string;
};

/**
 * Picks a template for a moment type + variant, never repeating `lastId`
 * back-to-back when the pool has more than one entry (getMomentumBannerCopy pattern).
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function pickTemplate(
  type: MomentType,
  variant: string,
  lastId?: string | null,
  rng: () => number = Math.random,
): PickedTemplate | null {
  const pool = MOMENT_CONTENT[type]?.[variant];
  if (!pool || pool.length === 0) return null;
  const entries = pool.map((template, i) => ({ id: `${type}.${variant}.${i}`, template }));
  const avail = entries.length > 1 ? entries.filter((e) => e.id !== lastId) : entries;
  const source = avail.length > 0 ? avail : entries;
  return source[Math.floor(rng() * source.length)]!;
}
