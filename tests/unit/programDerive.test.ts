import {
  paceFactor,
  scaleTarget,
  programMarkWeeklyTarget,
  deriveProgramState,
  programWeekStart,
  type ProgramEventInput,
} from '@/lib/programs/derive';
import type { ProgramDefinition } from '@/lib/programs/types';

// A minimal 3-week card for math tests: variable-mark targets 4/5/6, bars 3/4/5.
const def: ProgramDefinition = {
  id: 'test-prog',
  title: 'Test Program',
  tagline: 'For the math.',
  domain: 'focus',
  durationWeeks: 3,
  whyItWorks: 'Because the tests say so.',
  stages: [0, 1, 2].map((i) => ({
    name: `Week ${i + 1} · Stage`,
    marks: [{ libraryId: 'deep-work', weeklyTarget: 4 + i }],
    bar: { daysRequired: 3 + i },
    copy: { intro: 'a', held: 'b', partial: 'c', quiet: 'd', advance: 'e' },
  })),
};

const mark = { id: 'm1' };
const ev = (date: string): ProgramEventInput => ({
  mark_id: 'm1',
  event_type: 'increment',
  occurred_local_date: date,
  deleted_at: null,
});

// created_at Monday 2026-08-03 → week 1 = Aug 3-9, week 2 = Aug 10-16, week 3 = Aug 17-23.
const goal = { created_at: '2026-08-03T08:00:00.000Z' };

describe('pace scaling', () => {
  it('factors are 0.75 / 1 / 1.15', () => {
    expect(paceFactor('easing')).toBe(0.75);
    expect(paceFactor('steady')).toBe(1);
    expect(paceFactor('push')).toBe(1.15);
  });

  it('rounds and floors at 1', () => {
    expect(scaleTarget(4, 'easing')).toBe(3); // 3.0
    expect(scaleTarget(4, 'push')).toBe(5); // 4.6 -> 5
    expect(scaleTarget(1, 'easing')).toBe(1); // 0.75 -> min 1
    expect(scaleTarget(4, 'steady', 0.6)).toBe(2); // eased 2.4 -> 2
    expect(scaleTarget(1, 'easing', 0.6)).toBe(1); // never below 1
  });

  it('fixed marks are never scaled', () => {
    const fixedLib = { frequencyKind: 'fixed', frequency_recommended: 7 };
    expect(programMarkWeeklyTarget(fixedLib, 7, 'easing')).toBe(7);
    expect(programMarkWeeklyTarget(fixedLib, 7, 'push', 0.6)).toBe(7);
    const varLib = { frequencyKind: 'variable', frequency_recommended: 4 };
    expect(programMarkWeeklyTarget(varLib, 4, 'easing')).toBe(3);
  });
});

describe('week anchoring', () => {
  it('programWeekStart returns the Monday of the containing week', () => {
    expect(programWeekStart('2026-08-03')).toBe('2026-08-03'); // Monday
    expect(programWeekStart('2026-08-06')).toBe('2026-08-03'); // Thursday
    expect(programWeekStart('2026-08-09')).toBe('2026-08-03'); // Sunday
  });
});

describe('stage index and completion', () => {
  it('start week is week 1 regardless of start day', () => {
    // Started Thursday; the containing Monday anchors week 1.
    const thuGoal = { created_at: '2026-08-06T12:00:00.000Z' };
    const s = deriveProgramState(def, thuGoal, [mark], [], 'steady', '2026-08-08');
    expect(s.stageIndex).toBe(0);
    expect(s.completed).toBe(false);
  });

  it('advances on Mondays and clamps to the card', () => {
    expect(deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-09').stageIndex).toBe(0);
    expect(deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-10').stageIndex).toBe(1);
    expect(deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-17').stageIndex).toBe(2);
    // Past the final week: clamped, completed.
    const done = deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-24');
    expect(done.stageIndex).toBe(2);
    expect(done.completed).toBe(true);
  });

  it('completion is sticky by derivation (dates only move forward)', () => {
    const later = deriveProgramState(def, goal, [mark], [], 'steady', '2026-12-01');
    expect(later.completed).toBe(true);
  });
});

describe('week grades', () => {
  it('grades each closed week against its stage bar: held / partial / quiet', () => {
    const events = [
      // Week 1 (bar 3): 3 active days -> held.
      ev('2026-08-03'),
      ev('2026-08-04'),
      ev('2026-08-05'),
      // Week 2 (bar 4): 1 active day -> partial.
      ev('2026-08-12'),
      // Week 3: nothing -> quiet (once closed).
    ];
    const s = deriveProgramState(def, goal, [mark], events, 'steady', '2026-08-24');
    expect(s.weekGrades).toEqual(['held', 'partial', 'quiet']);
  });

  it('soft-deleted, non-increment, and other-mark events never count', () => {
    const events: ProgramEventInput[] = [
      {
        mark_id: 'm1',
        event_type: 'increment',
        occurred_local_date: '2026-08-03',
        deleted_at: '2026-08-04T00:00:00Z',
      },
      { mark_id: 'm1', event_type: 'decrement', occurred_local_date: '2026-08-03', deleted_at: null },
      { mark_id: 'other', event_type: 'increment', occurred_local_date: '2026-08-03', deleted_at: null },
    ];
    const s = deriveProgramState(def, goal, [mark], events, 'steady', '2026-08-10');
    expect(s.weekGrades).toEqual(['quiet']);
  });

  it('the bar is pace-scaled: easing lowers it', () => {
    // Week 1 bar 3 -> easing 2.25 -> 2. Two active days grade held at easing, partial at steady.
    const events = [ev('2026-08-03'), ev('2026-08-04')];
    expect(deriveProgramState(def, goal, [mark], events, 'easing', '2026-08-10').weekGrades).toEqual([
      'held',
    ]);
    expect(deriveProgramState(def, goal, [mark], events, 'steady', '2026-08-10').weekGrades).toEqual([
      'partial',
    ]);
  });
});

describe('eased mode', () => {
  it('a quiet closed week renders the current stage eased', () => {
    const s = deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-10');
    expect(s.mode).toBe('eased');
    // Stage 2 mark target 5 -> eased 0.6 -> 3.
    expect(s.scaledMarks[0].weeklyTarget).toBe(3);
    // Stage 2 bar 4 -> eased 2.4 -> 2.
    expect(s.scaledBar).toBe(2);
  });

  it('a held closed week renders the current stage at full strength', () => {
    const events = [ev('2026-08-03'), ev('2026-08-04'), ev('2026-08-05')];
    const s = deriveProgramState(def, goal, [mark], events, 'steady', '2026-08-10');
    expect(s.mode).toBe('normal');
    expect(s.scaledMarks[0].weeklyTarget).toBe(5);
    expect(s.scaledBar).toBe(4);
  });

  it('week 1 is never eased and a week entered eased is graded at the eased bar', () => {
    const first = deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-05');
    expect(first.mode).toBe('normal');
    // Week 1 quiet -> week 2 eased (bar 4 -> 2). Two active days in week 2
    // grade week 2 held once it closes.
    const events = [ev('2026-08-11'), ev('2026-08-12')];
    const s = deriveProgramState(def, goal, [mark], events, 'steady', '2026-08-17');
    expect(s.weekGrades).toEqual(['quiet', 'held']);
    expect(s.mode).toBe('normal');
  });

  it('a completed program is never eased', () => {
    const s = deriveProgramState(def, goal, [mark], [], 'steady', '2026-08-24');
    expect(s.completed).toBe(true);
    expect(s.mode).toBe('normal');
  });
});
