/**
 * QC2-G — Free per-goal mark cap copy guard.
 *
 * The cap was raised 3 → 5 (founder decision, 2026-07-14). The user-facing
 * limit copy lives inline at three call sites (matching the existing pattern;
 * only the goal-limit message is centralized in lib/copy.ts). This guard keeps
 * the number in the copy in sync with lib/gating.ts FREE_MARKS_PER_GOAL and
 * fails if a stale "3 marks on this goal" string reappears.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { FREE_MARKS_PER_GOAL } from '../../lib/gating';

const read = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8');

describe('per-goal mark cap copy (5, QC2-G)', () => {
  test('FREE_MARKS_PER_GOAL and copy agree on 5', () => {
    expect(FREE_MARKS_PER_GOAL).toBe(5);
  });

  test('useCounters throws the 5-mark message', () => {
    const src = read('hooks/useCounters.ts');
    expect(src).toContain("You've added 5 marks to this goal. Livra+ lets you add more.");
    expect(src).not.toContain("You've added 3 marks to this goal");
  });

  test('mark/new.tsx toast says 5', () => {
    const src = read('app/mark/new.tsx');
    expect(src).toContain('That’s 5 marks on this goal. Livra+ lets you add more.');
    expect(src).not.toContain('3 marks on this goal');
  });

  test('AddMarkSheet upsell says 5', () => {
    const src = read('components/sheets/AddMarkSheet.tsx');
    expect(src).toContain("That's 5 marks on this goal");
    expect(src).toContain('Five focused marks per goal keeps things doable.');
    expect(src).not.toContain('3 marks on this goal');
  });

  test('onboarding footnote says 5', () => {
    const src = read('app/onboarding.tsx');
    expect(src).toContain('Free tier includes up to 5 marks per goal.');
    expect(src).not.toContain('up to 3 marks per goal');
  });

  test('server RLS backstop migration for the 5 cap exists', () => {
    const src = read('supabase/migrations/20260714_raise_marks_per_goal_cap_to_5.sql');
    expect(src).toContain('< 5');
    expect(src).toContain('DROP POLICY IF EXISTS "Free tier: max 3 marks per goal"');
  });
});
