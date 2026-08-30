// lib/programs/catalog/deepWorkMonth.ts
// Deep Work Month (PG-1). Content only; structure guarded by
// programCatalog.test.ts, strings held to the copy rules by copyDashRule.test.ts.
//
// Library facts this card leans on: `deep-work` is variable 3/4/6 and
// `planning` variable 3/5/7, so their targets progress 2 to 3 to 4 across the
// month; `screen-time` is fixed 7/7/7 (the bar, 3/3/4/4, carries its ask).

import type { ProgramDefinition } from '../types';

export const deepWorkMonth: ProgramDefinition = {
  id: 'deep-work-month',
  title: 'Deep Work Month',
  tagline: 'Four weeks to a focused block you can rely on.',
  domain: 'focus',
  durationWeeks: 4,
  whyItWorks:
    'Focus is not a personality trait, it is a practice with a schedule. This month builds it the way strength is built: short honest blocks first, then more of them, then protection around them. By week four the deep block is not an event anymore. It is just how your day starts.',
  stages: [
    {
      name: 'Week 1 · One honest block',
      marks: [{ libraryId: 'deep-work', weeklyTarget: 2 }],
      bar: { daysRequired: 3 },
      copy: {
        intro:
          'Start small on purpose: a couple of uninterrupted blocks this week, any length you can finish. The win is completing them, not surviving them.',
        held: 'You showed up for the block. That is the entire skill in miniature.',
        partial: 'A block or two landed. Every finished block is a rep, and reps are the point.',
        quiet:
          'The week filled up, as weeks do. The block waits, shorter now, ready when you are.',
        advance: 'Monday adds a planning touch, so the block knows what it is for.',
      },
    },
    {
      name: 'Week 2 · The block gets a plan',
      marks: [
        { libraryId: 'deep-work', weeklyTarget: 3 },
        { libraryId: 'planning', weeklyTarget: 3 },
      ],
      bar: { daysRequired: 3 },
      copy: {
        intro:
          'A block without a target leaks. This week, a short planning sit before the day starts, and one more deep block than last week.',
        held: 'Planned blocks hit different, and you felt it. The system is starting to hum.',
        partial: 'Some days got the plan and the block together. Those are the template.',
        quiet:
          'It slipped this week, and that is allowed. Come back with one planned block; the rest follows.',
        advance: 'Monday raises the count a notch. The plan stays the same size.',
      },
    },
    {
      name: 'Week 3 · More reps, same form',
      marks: [
        { libraryId: 'deep-work', weeklyTarget: 4 },
        { libraryId: 'planning', weeklyTarget: 4 },
      ],
      bar: { daysRequired: 4 },
      copy: {
        intro:
          'The volume week: four planned blocks. Nothing new to learn, just more of what already works. Guard the mornings if you can.',
        held: 'Four planned blocks in one week. That is a professional rhythm, quietly built.',
        partial: 'The rhythm held on some days, and rhythm is exactly what this week was for.',
        quiet:
          'Volume weeks are the easiest to lose, and losing one is not losing the month. Ease back in.',
        advance: 'Monday adds the last piece: protecting the block from your phone.',
      },
    },
    {
      name: 'Week 4 · Protect the block',
      marks: [
        { libraryId: 'deep-work', weeklyTarget: 4 },
        { libraryId: 'planning', weeklyTarget: 4 },
        { libraryId: 'screen-time', weeklyTarget: 7 },
      ],
      bar: { daysRequired: 4 },
      copy: {
        intro:
          'The full system: planned blocks with the phone kept inside a limit you set. This is the week the practice becomes the default.',
        held: 'Blocks, plans, and a fence around them. This is what a month of practice buys.',
        partial: 'The full system ran on some days, and those days are the ones to keep.',
        quiet:
          'A quiet closing week does not undo three weeks of reps. Finish with one gentle block.',
        advance:
          'The month closes here. Keep the morning block; it is the part that pays for everything else.',
      },
    },
  ],
};
