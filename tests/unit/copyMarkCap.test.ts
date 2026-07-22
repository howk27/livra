/**
 * Free-tier mark limit copy guard (founder decision 2026-07-22).
 *
 * There are now TWO walls, and they must never be described by one message:
 *   • this goal is full        → MARK_PER_GOAL_LIMIT_MESSAGE (4 per goal)
 *   • the account is full      → MARK_CEILING_MESSAGE (6 in total)
 * Both live in lib/copy.ts and take their numbers from lib/gating.ts, so the
 * copy cannot drift from the gate. This guard also fails if a stale "5 marks on
 * this goal" literal reappears at any call site.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { FREE_MARKS_PER_GOAL, FREE_MARK_CEILING } from '../../lib/gating';
import { MARK_PER_GOAL_LIMIT_MESSAGE, MARK_CEILING_MESSAGE } from '../../lib/copy';

const read = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8');

describe('free-tier mark limit copy', () => {
  test('the per-goal message names the real cap and the real reason', () => {
    expect(MARK_PER_GOAL_LIMIT_MESSAGE).toBe(
      'Free keeps each goal to 4 marks so the goal stays something you can actually do. Livra+ opens unlimited marks.',
    );
    expect(MARK_PER_GOAL_LIMIT_MESSAGE).toContain(String(FREE_MARKS_PER_GOAL));
  });

  test('the ceiling message names the account-wide total and both buckets', () => {
    expect(MARK_CEILING_MESSAGE).toBe(
      'Free tracks 6 marks in total across your goals and daily habits, and you’re at 6. Free one up, or Livra+ opens unlimited marks.',
    );
    expect(MARK_CEILING_MESSAGE).toContain(String(FREE_MARK_CEILING));
  });

  test('the two messages are distinct', () => {
    expect(MARK_PER_GOAL_LIMIT_MESSAGE).not.toBe(MARK_CEILING_MESSAGE);
  });

  test('neither message uses a dash as a separator', () => {
    expect(MARK_PER_GOAL_LIMIT_MESSAGE).not.toMatch(/[—–]/);
    expect(MARK_CEILING_MESSAGE).not.toMatch(/[—–]/);
  });

  test('useCounters throws both messages from the constants, never inline', () => {
    const src = read('hooks/useCounters.ts');
    expect(src).toContain('FREE_COUNTER_LIMIT_REACHED: ${MARK_PER_GOAL_LIMIT_MESSAGE}');
    expect(src).toContain('FREE_COUNTER_LIMIT_REACHED: ${MARK_CEILING_MESSAGE}');
    expect(src).not.toContain('marks to this goal. Livra+ lets you add more.');
  });

  test('mark/new surfaces the message that actually fired', () => {
    const src = read('app/mark/new.tsx');
    expect(src).toContain("error.message.replace('FREE_COUNTER_LIMIT_REACHED: ', '')");
    expect(src).not.toContain('marks on this goal');
  });

  test('goal detail uses the centralized per-goal message', () => {
    const src = read('app/goal/[id].tsx');
    expect(src).toContain('showError(MARK_PER_GOAL_LIMIT_MESSAGE)');
    expect(src).not.toContain('marks on this goal');
  });

  test('onboarding footnote states both caps', () => {
    const src = read('app/onboarding.tsx');
    expect(src).toContain('Free tier includes up to 4 marks per goal · 6 marks in total.');
    expect(src).not.toContain('up to 5 marks per goal');
  });

  test('the server RLS backstop migration for both caps exists', () => {
    const src = read('supabase/migrations/20260722_free_tier_mark_ceiling.sql');
    expect(src).toContain('< 4');
    expect(src).toContain('< 6');
    expect(src).toContain('DROP POLICY IF EXISTS "Free tier: max 3 marks per goal"');
    expect(src).toContain('DROP POLICY IF EXISTS "Free tier: max 5 marks per goal"');
    // Upsert safety: both counting helpers must exclude the row being written.
    expect(src).toContain('id <> p_id');
    // livra_is_pro is called, never redefined (it owns expiry since 20260721).
    expect(src).toContain('public.livra_is_pro(auth.uid())');
    expect(src).not.toMatch(/FUNCTION public\.livra_is_pro/);
  });

  test('the superseded 5-cap migration is not the live one', () => {
    // It stays in the tree for history but must never be described as current.
    const src = read('supabase/migrations/20260722_free_tier_mark_ceiling.sql');
    expect(src).toContain('SUPERSEDES 20260714_raise_marks_per_goal_cap_to_5.sql');
  });
});
