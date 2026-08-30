// lib/programs/catalog/sleepReset.ts
// Sleep Reset (PG-1). Content only; structure guarded by programCatalog.test.ts,
// strings held to the copy rules by copyDashRule.test.ts (COPY_MODULES).
//
// Library facts this card leans on: `sleep`, `no-caffeine` and `screen-time`
// are fixed 7/7/7 whole-day states, so progression rides the stage BAR
// (3 to 4 to 5), never their weekly targets. `breathwork` is variable 3/5/7.

import type { ProgramDefinition } from '../types';

export const sleepReset: ProgramDefinition = {
  id: 'sleep-reset',
  title: 'Sleep Reset',
  tagline: 'Three weeks to nights that actually restore you.',
  domain: 'sleep',
  durationWeeks: 3,
  whyItWorks:
    'Sleep does not improve by wanting it more. It improves when the hours before bed stop working against you. This program moves one lever each week: first a steady wind down, then the caffeine that lingers longer than you think, then the screen that keeps the lights on in your head. Small, boring, and it works.',
  stages: [
    {
      name: 'Week 1 · A steady wind-down',
      marks: [
        { libraryId: 'sleep', weeklyTarget: 7 },
        { libraryId: 'breathwork', weeklyTarget: 3 },
      ],
      bar: { daysRequired: 3 },
      copy: {
        intro:
          'This week is about one thing: ending the day on purpose. A few quiet minutes of breathing before bed, and note each morning how the night went.',
        held: 'You gave your nights a shape. That is the foundation everything else builds on.',
        partial: 'Some nights got a real ending. Each one taught your body what to expect.',
        quiet:
          'The week went elsewhere, and that happens. The wind down is still here, smaller and easier to hold.',
        advance: 'Monday adds the caffeine piece. The wind down keeps going.',
      },
    },
    {
      name: 'Week 2 · Caffeine has a curfew',
      marks: [
        { libraryId: 'sleep', weeklyTarget: 7 },
        { libraryId: 'breathwork', weeklyTarget: 3 },
        { libraryId: 'no-caffeine', weeklyTarget: 7 },
      ],
      bar: { daysRequired: 4 },
      copy: {
        intro:
          'Caffeine stays in your system far longer than the buzz does. This week, set a cutoff time you can live with and keep to it. Everything from week 1 continues.',
        held: 'Four solid days with a caffeine curfew. Your nights are getting cleaner inputs.',
        partial: 'The curfew held some days, and those days count. It gets easier as the habit sets.',
        quiet:
          'A quiet week is information, not a verdict. The curfew comes back gently, one afternoon at a time.',
        advance: 'Monday brings the last lever: the screen. The rest is rhythm now.',
      },
    },
    {
      name: 'Week 3 · The screen goes dark first',
      marks: [
        { libraryId: 'sleep', weeklyTarget: 7 },
        { libraryId: 'breathwork', weeklyTarget: 3 },
        { libraryId: 'no-caffeine', weeklyTarget: 7 },
        { libraryId: 'screen-time', weeklyTarget: 7 },
      ],
      bar: { daysRequired: 5 },
      copy: {
        intro:
          'The last mover: screens end before you do. Set a screen limit for the evening and let the wind down fill the space. This is the whole system running at once.',
        held: 'Five days of the full routine. This is what a reset looks like from the inside.',
        partial: 'The full routine landed on some days. Those nights are the proof it works.',
        quiet:
          'The finish line week went quiet, and the door is still open. The routine is lighter now; walk it home.',
        advance: 'The program closes here. The routine is yours to keep, and it fits in one evening.',
      },
    },
  ],
};
