// The registry: every line Livra can say, keyed by moment type + variant.
// Copy is data: adding a future moment means adding entries, not logic.
// Rotation follows lib/copy.ts getMomentumBannerCopy: the CALLER holds the last id;
// the engine stays pure.
//
// ─── Who is speaking (PL-6 character sheet) ─────────────────────────────────
// (Comment hygiene: no em/en dashes and no apostrophes anywhere in this file;
// the copyDashRule suite scans the raw source, comments included.)
//
// Livra is a QUIET MENTOR: a close friend who wants you to reach your goal and
// says so rarely, plainly, and only when there is something true to say.
// Silence is the default register; every line below had to argue its way in.
//
// Three registers, never mixed in one line:
//   1. Mentor (default): calm, concrete, unhurried. States what is true and,
//      at most, names one small next action.
//   2. Direct (slipping ONLY, M3): one plain sentence, the why of this user
//      said back, plus the smallest next action. No hedges, no softening,
//      and absolutely no guilt. This is the only moment allowed to push.
//   3. Playful-dry (good moments ONLY: celebrations, post-log, empty states,
//      the odd greeting): understated, deadpan, never zany. The number or
//      the fact does the talking; the line just stands next to it.
//
// Forbidden moves (Jest walks this registry and enforces the mechanical ones):
//   guilt or shame framing · loss language (you will lose, countdowns) ·
//   streak vocabulary (Momentum is the owned noun; it bends, never breaks) ·
//   exclamation marks · sycophancy (amazing, you got this, cheerleading) ·
//   em/en dashes or hyphen-as-dash (middle dot · is the separator) ·
//   generic filler that could ship in any habit app.
//
// The one test every line must pass: could this line only have been written
// about THIS user right now (their why, their run, their week, their day)?
// Where a line is necessarily generic (default greetings, plain post-log),
// it must at least be honest and never PRETEND to be personal.
//
// Vocabulary contract: Goal, Mark, Momentum are the owned nouns (lib/copy.ts
// TERMS). Check-in is sanctioned for the act of logging. Never streak, never
// habit-tracker vocabulary, never competitor names.
import type { MomentType } from './types';

/** Named sub-variants per moment type. Selection logic picks the variant; this file owns the words. */
export const MOMENT_CONTENT: Record<MomentType, Record<string, readonly string[]>> = {
  // M1, first week (goal gradient: the early days count double; warm, not cheering).
  firstWeek: {
    orientation: [
      'Day one of {goalTitle}. One mark is a start.',
      '{goalTitle} starts today. It asks for one mark, not a promise.',
    ],
    pull: [
      'Almost through week one of {goalTitle}. It counts double, psychologically.',
      'Week one of {goalTitle} is nearly done. The first week is the steep part.',
      'A few more days and {goalTitle} has its first full week.',
    ],
    // M1 first-ever log acknowledgment; renders on the postLog pill (keep short).
    firstLog: [
      'First mark on {goalTitle}. It is real now.',
      'That is the first one on {goalTitle}. Noted.',
      '{goalTitle}, day one, done.',
    ],
  },
  // M2, celebration (dry pride; the number does the talking; one line, then quiet).
  celebration: {
    threshold: [
      '{runDays} days on {goalTitle} · that is a habit forming.',
      '{runDays} days of {goalTitle}. Quiet, steady, yours.',
      '{runDays} days on {goalTitle}. That was not an accident.',
    ],
    // Index 0 is the canonical record line from the spec; keep it first.
    newBest: [
      '{runDays} days on {goalTitle}. Your longest yet.',
      'A new longest run on {goalTitle}: {runDays} days.',
      '{runDays} days. {goalTitle} has a new record.',
    ],
  },
  // M3, the ONE direct sentence: the why of this user, said back plainly, plus
  // the smallest next action. No hedges, no guilt, no countdowns. Every variant
  // quotes the why in single quotes (fillTemplate truncates it to 80 chars).
  whyResurface: {
    direct: [
      "You wrote: '{why}'. One check-in keeps it alive.",
      "Your reason was '{why}'. It still is. One mark today.",
      "You said it yourself: '{why}'. One check-in today holds it.",
    ],
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
  // M5, post-log micro-feedback. Renders in the VoiceLine pill (~8 words, keep
  // every template ≤ 60 chars). Most logs get silence; when Livra speaks it is
  // one short true thing. `plain` may be playful-dry; `slippingGentle` is NOT.
  postLog: {
    firstOfDay: [
      'First mark of the day. The rest comes easier.',
      'One in. The day has started properly.',
      'Day opened. That was the hard one.',
    ],
    closesDay: [
      'That is everything for today. Well held.',
      'Today is settled. All of it.',
      'The whole day, done. Enjoy the quiet.',
    ],
    closesWeek: [
      'That one is settled for the week. Extras still count.',
      'Week complete on that one. More is welcome, not required.',
      'Target met for the week. The ceiling is yours to ignore.',
    ],
    slippingGentle: [
      'Good. That one mattered.',
      'That mark did more than most.',
      'Momentum bends, it does not break. That helped.',
    ],
    plain: [
      'Logged. Small and real.',
      'Noted. It adds up quietly.',
      'Another one. Momentum likes routine.',
      'Counted. Carry on.',
      'One more. The unglamorous kind of progress.',
      'Marked. The day noticed.',
      'In the book. Same time tomorrow.',
    ],
  },
  // M6, default greeting rotation: calm, {name} aware, no goal reference.
  // Honest about being general; it never pretends to be personal.
  greetingDefault: {
    default: [
      '{name}, one step is enough.',
      '{name}, nothing dramatic today. One mark will do.',
      '{name}, quiet days count too.',
      '{name}, pick one thing. That is the whole plan.',
      '{name}, start small. It tends to hold.',
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
