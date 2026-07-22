import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  canAddGoal,
  canAddMark,
  canAddMarkToGoal,
  countActiveMarks,
  countMarksInGoal,
  remainingMarkAllowance,
  canExportData,
  canCustomizeShareCard,
  FREE_GOAL_LIMIT,
  FREE_MARK_CEILING,
  FREE_MARKS_PER_GOAL,
} from '../../lib/gating';

describe('FREE limits (founder decision 2026-07-22)', () => {
  test('FREE_GOAL_LIMIT is 2 (active goals on free)', () => {
    expect(FREE_GOAL_LIMIT).toBe(2);
  });
  test('FREE_MARKS_PER_GOAL is 4 (lowered from 5)', () => {
    expect(FREE_MARKS_PER_GOAL).toBe(4);
  });
  test('FREE_MARK_CEILING is 6 (account-wide, goal-linked + unlinked together)', () => {
    expect(FREE_MARK_CEILING).toBe(6);
  });
});

describe('retired constants and predicates', () => {
  const gating = require('../../lib/gating');

  test.each(['FREE_MARK_LIMIT', 'FREE_HABIT_LIMIT', 'canAddHabitMark', 'countUnlinkedMarks'])(
    '%s is gone from lib/gating',
    (name) => {
      expect(gating[name]).toBeUndefined();
    },
  );

  test('no live caller references the retired names', () => {
    const ROOT = join(__dirname, '../../');
    const SKIP = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist', '.reports']);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        // This file names them on purpose (the assertions above).
        if (full.endsWith('gating.test.ts')) continue;
        // Comments may name the retired constants (lib/gating.ts explains why
        // the habit bucket is gone); only real references count.
        const src = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
        if (/\b(FREE_MARK_LIMIT|FREE_HABIT_LIMIT|canAddHabitMark|countUnlinkedMarks)\b/.test(src)) {
          offenders.push(full.slice(ROOT.length));
        }
      }
    };
    walk(ROOT);

    expect(offenders).toEqual([]);
  });
});

describe('canAddGoal', () => {
  test('free user with 1 active goal can add', () => expect(canAddGoal(false, 1)).toBe(true));
  test('free user at 2 active goals is blocked', () => expect(canAddGoal(false, 2)).toBe(false));
  test('pro user unlimited', () => expect(canAddGoal(true, 100)).toBe(true));
});

describe('canAddMark (account-wide ceiling)', () => {
  test('free user with 5 marks anywhere can add a 6th', () =>
    expect(canAddMark(false, 5)).toBe(true));
  test('free user at 6 marks is blocked (boundary)', () => expect(canAddMark(false, 6)).toBe(false));
  test('free user past the ceiling stays blocked', () => expect(canAddMark(false, 9)).toBe(false));
  test('free user with 0 marks can add', () => expect(canAddMark(false, 0)).toBe(true));
  test('pro user is never blocked', () => expect(canAddMark(true, 100)).toBe(true));
});

describe('canAddMarkToGoal (per-goal cap)', () => {
  test('free user with 3 marks on the goal can add a 4th (boundary)', () =>
    expect(canAddMarkToGoal(false, 3)).toBe(true));
  test('free user with 4 marks on the goal is blocked (5th gated)', () =>
    expect(canAddMarkToGoal(false, 4)).toBe(false));
  test('free user with 0 marks on the goal can add', () =>
    expect(canAddMarkToGoal(false, 0)).toBe(true));
  test('pro user is never blocked', () => expect(canAddMarkToGoal(true, 99)).toBe(true));
});

describe('both caps together — whichever binds first', () => {
  // The realistic split the founder described: 2 goals, 3 marks each = 6 total.
  const split = [
    { id: 'a1', goal_id: 'A', deleted_at: null },
    { id: 'a2', goal_id: 'A', deleted_at: null },
    { id: 'a3', goal_id: 'A', deleted_at: null },
    { id: 'b1', goal_id: 'B', deleted_at: null },
    { id: 'b2', goal_id: 'B', deleted_at: null },
    { id: 'b3', goal_id: 'B', deleted_at: null },
  ];

  test('the ceiling binds before the per-goal cap in a 3+3 split', () => {
    // Goal A has room per-goal (3 < 4) but the account is full (6).
    expect(canAddMarkToGoal(false, countMarksInGoal(split, 'A'))).toBe(true);
    expect(canAddMark(false, countActiveMarks(split))).toBe(false);
  });

  test('a 2-goal free user cannot exceed 6 marks in total', () => {
    expect(countActiveMarks(split)).toBe(FREE_MARK_CEILING);
    expect(canAddMark(false, countActiveMarks(split))).toBe(false);
  });

  test('the per-goal cap binds first when one goal is loaded up (4 + 1)', () => {
    const loaded = [
      { id: 'a1', goal_id: 'A', deleted_at: null },
      { id: 'a2', goal_id: 'A', deleted_at: null },
      { id: 'a3', goal_id: 'A', deleted_at: null },
      { id: 'a4', goal_id: 'A', deleted_at: null },
      { id: 'b1', goal_id: 'B', deleted_at: null },
    ];
    expect(canAddMarkToGoal(false, countMarksInGoal(loaded, 'A'))).toBe(false);
    expect(canAddMark(false, countActiveMarks(loaded))).toBe(true); // 5 < 6
  });

  test('standalone habits count against the same ceiling as goal marks', () => {
    const mixed = [
      { id: 'a1', goal_id: 'A', deleted_at: null },
      { id: 'a2', goal_id: 'A', deleted_at: null },
      { id: 'h1', goal_id: null, deleted_at: null },
      { id: 'h2', goal_id: null, deleted_at: null },
      { id: 'h3', goal_id: null, deleted_at: null },
      { id: 'h4', goal_id: null, deleted_at: null },
    ];
    expect(countActiveMarks(mixed)).toBe(6);
    // Goal A is nowhere near its per-goal cap, but the habits filled the account.
    expect(canAddMarkToGoal(false, countMarksInGoal(mixed, 'A'))).toBe(true);
    expect(canAddMark(false, countActiveMarks(mixed))).toBe(false);
  });

  test('pro bypasses both caps on the same data', () => {
    expect(canAddMark(true, countActiveMarks(split))).toBe(true);
    expect(canAddMarkToGoal(true, 99)).toBe(true);
  });
});

describe('countActiveMarks (the ceiling bucket)', () => {
  const marks = [
    { id: 'm1', goal_id: 'A', deleted_at: null },
    { id: 'm2', goal_id: null, deleted_at: null },
    { id: 'm3', goal_id: undefined, deleted_at: null },
    { id: 'm4', goal_id: 'A', deleted_at: '2026-01-01' }, // deleted — excluded
    { id: 'm5', goal_id: null, deleted_at: '2026-01-01' }, // deleted — excluded
  ];

  test('counts goal-linked and unlinked marks together', () => {
    expect(countActiveMarks(marks)).toBe(3);
  });
  test('ignores soft-deleted marks', () => {
    expect(countActiveMarks([{ id: 'x', goal_id: 'A', deleted_at: 'now' }])).toBe(0);
  });
  test('empty list counts zero', () => {
    expect(countActiveMarks([])).toBe(0);
  });
});

describe('countMarksInGoal', () => {
  const marks = [
    { id: 'm1', goal_id: 'A', deleted_at: null },
    { id: 'm2', goal_id: 'A', deleted_at: null },
    { id: 'm3', goal_id: 'B', deleted_at: null },
    { id: 'm4', goal_id: 'A', deleted_at: '2026-01-01' }, // deleted — excluded
    { id: 'm5', goal_id: null, deleted_at: null }, // unlinked — excluded
  ];

  test('counts only active marks feeding the given goal', () => {
    expect(countMarksInGoal(marks, 'A')).toBe(2);
  });
  test('per-goal isolation: goal B unaffected by goal A marks', () => {
    expect(countMarksInGoal(marks, 'B')).toBe(1);
  });
  test('goal with no marks counts zero', () => {
    expect(countMarksInGoal(marks, 'C')).toBe(0);
  });
  test('ignores soft-deleted marks', () => {
    expect(countMarksInGoal([{ id: 'x', goal_id: 'A', deleted_at: 'now' }], 'A')).toBe(0);
  });
});

describe('remainingMarkAllowance', () => {
  test('free user with 2 marks has 4 left', () => expect(remainingMarkAllowance(false, 2)).toBe(4));
  test('free user at the ceiling has 0 left', () => expect(remainingMarkAllowance(false, 6)).toBe(0));
  test('never goes negative', () => expect(remainingMarkAllowance(false, 9)).toBe(0));
  test('pro is unbounded', () =>
    expect(remainingMarkAllowance(true, 99)).toBe(Number.POSITIVE_INFINITY));
});

describe('Livra+ feature gates', () => {
  test('data export (CSV): free blocked, pro allowed', () => {
    expect(canExportData(false)).toBe(false);
    expect(canExportData(true)).toBe(true);
  });
  test('customize share card: free blocked, pro allowed', () => {
    expect(canCustomizeShareCard(false)).toBe(false);
    expect(canCustomizeShareCard(true)).toBe(true);
  });
});

describe('canCustomizeShareCard', () => {
  it('allows customization only for Pro users', () => {
    expect(canCustomizeShareCard(true)).toBe(true);
    expect(canCustomizeShareCard(false)).toBe(false);
  });

  it('no longer exports the old canUseShareCard gate', () => {
    const gating = require('../../lib/gating');
    expect(gating.canUseShareCard).toBeUndefined();
  });
});
