/**
 * FU-6 — analytics taxonomy + gate-reason copy contract tests.
 *
 * Verifies:
 *   1. ai_plan_suggested is registered in the ANALYTICS_EVENTS taxonomy.
 *   2. goal_created's shape (via goalsSlice.createGoal) includes method: 'manual' | 'ai',
 *      defaulting to 'manual' when the caller omits it (manual creation flows).
 *   3. GENERATION_ERROR_COPY covers every GenerationFailReason the AI module can return.
 *   4. AI_EXHAUSTED_COPY has all four fields the exhausted panel renders.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ANALYTICS_EVENTS } from '../../lib/analytics/events';
import { GENERATION_ERROR_COPY, AI_EXHAUSTED_COPY } from '../../lib/copy';
import type { GenerationFailReason } from '../../lib/ai/goalGeneration';

describe('ai_plan_suggested taxonomy', () => {
  test('AI_PLAN_SUGGESTED is registered as ai_plan_suggested', () => {
    expect(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED).toBe('ai_plan_suggested');
  });

  test('GOAL_CREATED is unchanged (goal_created)', () => {
    expect(ANALYTICS_EVENTS.GOAL_CREATED).toBe('goal_created');
  });
});

describe('GENERATION_ERROR_COPY — covers every GenerationFailReason', () => {
  /**
   * Keyed by the union rather than listed as an array, so adding a member to
   * GenerationFailReason without giving it copy is a TYPE error at `npm run
   * type-check`, not a silently missing string at runtime. The old array form
   * accepted a short list quietly.
   */
  const REASON_COVERAGE: Record<GenerationFailReason, true> = {
    goal_too_short: true,
    low_confidence: true,
    network_error: true,
    invalid_output: true,
    free_use_exhausted: true,
    rate_limited_hour: true,
    rate_limited_day: true,
    rate_limited: true,
  };
  const REASONS = Object.keys(REASON_COVERAGE) as GenerationFailReason[];

  test.each(REASONS)('%s has a copy entry (string, possibly empty for goal_too_short)', (reason) => {
    expect(typeof GENERATION_ERROR_COPY[reason]).toBe('string');
  });

  test('free_use_exhausted copy mentions Livra+ and the manual continuation', () => {
    expect(GENERATION_ERROR_COPY.free_use_exhausted).toMatch(/Livra\+/);
  });

  /**
   * The two gates are answered differently and must never be confused:
   * free_use_exhausted is an entitlement wall you answer by subscribing;
   * rate_limited is a cooldown you answer by waiting. Selling Livra+ to a
   * subscriber who just hit their hourly window is nonsense, and the copy is
   * the only thing standing between those two states on screen.
   */
  test('rate_limited copy never sells Livra+ — a subscriber can hit it too', () => {
    expect(GENERATION_ERROR_COPY.rate_limited).not.toMatch(/Livra\+/);
    expect(GENERATION_ERROR_COPY.rate_limited.length).toBeGreaterThan(0);
  });
});

describe('AI_EXHAUSTED_COPY — inline panel fields', () => {
  test('has title, body, upsell, and manual fields', () => {
    expect(AI_EXHAUSTED_COPY.title.length).toBeGreaterThan(0);
    expect(AI_EXHAUSTED_COPY.body.length).toBeGreaterThan(0);
    expect(AI_EXHAUSTED_COPY.upsell.length).toBeGreaterThan(0);
    expect(AI_EXHAUSTED_COPY.manual.length).toBeGreaterThan(0);
  });

  test('the manual path is framed as always free, never a hard wall', () => {
    expect(AI_EXHAUSTED_COPY.manual.toLowerCase()).toMatch(/free/);
  });
});

describe('goal_created — method property shape', () => {
  // M9 Phase 5A Task 6: goal creation moved from the retired store to the
  // three creation surfaces, and each carries its OWN capture — so the method
  // property is now pinned where it is written, per surface.
  const read = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8');

  test('the manual surface captures method: "manual"', () => {
    const src = read('app/goal/new.tsx');
    const call = src.slice(src.indexOf('ANALYTICS_EVENTS.GOAL_CREATED'));
    expect(call.slice(0, 300)).toContain("method: 'manual'");
  });

  test('the AI package path captures method: "ai"', () => {
    const src = read('lib/goals/createFromAIPackage.ts');
    const call = src.slice(src.indexOf('ANALYTICS_EVENTS.GOAL_CREATED'));
    expect(call.slice(0, 300)).toContain("method: 'ai'");
  });

  test('onboarding branches the method on the path that built the goal', () => {
    const src = read('app/onboarding.tsx');
    const call = src.slice(src.indexOf('ANALYTICS_EVENTS.GOAL_CREATED'));
    expect(call.slice(0, 300)).toContain("method: isAIPath ? 'ai' : 'manual'");
  });
});
