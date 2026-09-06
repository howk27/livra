// lib/markHowTo.ts
// The "what doing it looks like" line for every library mark (First-100 sprint,
// board decision 2026-09-04): one concrete, calm instruction so no mark reads
// as jargon to decode. Content only. Keyed by MARK_LIBRARY id; coverage in both
// directions is pinned by tests/unit/markHowTo.test.ts, and every string is
// held to the copy rules by tests/unit/copyDashRule.test.ts (COPY_MODULES).
//
// Custom marks deliberately resolve to null: the user named the action
// themselves, and silence beats a generic template (the resolveMarkDefinition
// fallback already covers "what counts").
//
// Voice: one line, concrete, present tense, a time hint only where the mark
// genuinely has an hour. Founder voice review owed on all lines.

import { resolveLibraryMark, type MarkCategoryInput } from './markCategoryResolve';

export const MARK_HOW_TO: Record<string, string> = {
  sleep: 'Pick a bedtime you can keep tonight and start winding down half an hour before it.',
  stretch: 'Five unhurried minutes on the floor is a full session · evenings work well.',
  workout: 'Put it on the calendar before the day fills up · showing up is the session.',
  steps: 'Fold walking into the day you already have: park farther, take the stairs, pace your calls.',
  run: 'Lace up and step out · the first ten minutes decide it, distance is a detail.',
  swim: 'Pack the bag the night before so the pool is a decision already made.',
  cycling: 'Pick the route before you pick the pace · indoors counts the same.',
  water: 'Keep a bottle where you sit and refill it before it runs dry.',
  nutrition: 'Decide at breakfast what today’s eating looks like, then check in tonight.',
  calories: 'Know your range in the morning and let each meal spend from it.',
  'no-alcohol': 'Decide before the evening starts, and give your hands something else to hold.',
  'meal-prep': 'One session, a few containers: cook once, eat well for days.',
  'no-nicotine': 'Know your trigger moments and give each one a replacement ready to go.',
  'no-caffeine': 'Set a cutoff hour you can live with and switch to decaf or water past it.',
  skincare: 'Keep the routine next to your toothbrush · it happens where you already stand.',
  meditation: 'Sit, set a timer, follow the breath · a restless session still counts as sitting.',
  journaling: 'A few honest lines before bed · start with what happened, the rest follows.',
  gratitude: 'Name one real thing from today and write it where you will see it again.',
  breathwork: 'A few minutes of slow, deliberate breaths · in through the nose, long exhale out.',
  focus: 'Pick one task, silence the phone, and stay with it until the block ends.',
  planning: 'Before the day starts, choose the few things that would make it a good one.',
  reading: 'Keep the book where the phone usually lives · a handful of pages is a session.',
  practice: 'Short and focused beats long and vague · pick the one thing to repeat today.',
  study: 'One topic, one sitting, notes closed at the end to see what stuck.',
  'deep-work': 'Guard a morning stretch: door shut, phone elsewhere, one thing on the desk.',
  writing: 'Open the draft before the doubts open · rough words today, better ones tomorrow.',
  language: 'A short daily session beats a long weekly one · speak out loud, even alone.',
  finance: 'Ten minutes with the numbers: balances, upcoming bills, anything that moved.',
  saving: 'Move the money the day it arrives · what leaves first never gets spent.',
  'no-spend': 'Essentials only today · when the urge comes, park it on a list for later.',
  invest: 'Steady contributions on a schedule · review calmly, act rarely.',
  'side-hustle': 'One concrete task per session, picked before you sit down.',
  'cold-shower': 'End your normal shower with thirty cold seconds · in before the debate starts.',
  'no-sugar': 'Clear the easy temptations from reach and let fruit take the sweet slot.',
  'screen-time': 'Set the limit in your phone’s settings and put the loudest app behind it.',
  cooking: 'Pick the recipe in the morning so the evening only has to cook it.',
  socialize: 'Send the message now · plans firm up from one small opener.',
  family: 'Phone in another room, even for half an hour · presence is the whole practice.',
  networking: 'One genuine message or conversation · curiosity opens more doors than polish.',
  volunteer: 'Start with an hour somewhere real · regular beats grand.',
  creative: 'Set out the materials and make anything · unfinished counts in full.',
};

/** The concrete how-to line for a mark, or null for custom/unmatched marks. */
export function resolveMarkHowTo(mark: MarkCategoryInput): string | null {
  const lib = resolveLibraryMark(mark);
  if (!lib) return null;
  return MARK_HOW_TO[lib.id] ?? null;
}
