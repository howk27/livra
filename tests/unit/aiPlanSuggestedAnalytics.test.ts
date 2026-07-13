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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ANALYTICS_EVENTS } from '../../lib/analytics/events';
import { GENERATION_ERROR_COPY, AI_EXHAUSTED_COPY } from '../../lib/copy';
import type { GenerationFailReason } from '../../lib/ai/goalGeneration';
import { useGoalsStore } from '../../state/goalsSlice';
import * as posthog from '../../lib/analytics/posthog';

describe('ai_plan_suggested taxonomy', () => {
  test('AI_PLAN_SUGGESTED is registered as ai_plan_suggested', () => {
    expect(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED).toBe('ai_plan_suggested');
  });

  test('GOAL_CREATED is unchanged (goal_created)', () => {
    expect(ANALYTICS_EVENTS.GOAL_CREATED).toBe('goal_created');
  });
});

describe('GENERATION_ERROR_COPY — covers every GenerationFailReason', () => {
  const REASONS: GenerationFailReason[] = [
    'goal_too_short',
    'low_confidence',
    'network_error',
    'invalid_output',
    'free_use_exhausted',
  ];

  test.each(REASONS)('%s has a copy entry (string, possibly empty for goal_too_short)', (reason) => {
    expect(typeof GENERATION_ERROR_COPY[reason]).toBe('string');
  });

  test('free_use_exhausted copy mentions Livra+ and the manual continuation', () => {
    expect(GENERATION_ERROR_COPY.free_use_exhausted).toMatch(/Livra\+/);
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
  const USER = 'u-method-shape';
  let captureSpy: jest.SpyInstance;

  beforeEach(async () => {
    await AsyncStorage.clear();
    useGoalsStore.setState({ goals: [], isLoading: false, error: null });
    captureSpy = jest.spyOn(posthog, 'capture').mockImplementation(() => {});
  });

  afterEach(() => {
    captureSpy.mockRestore();
  });

  test('defaults to method: "manual" when the caller omits it', async () => {
    await useGoalsStore.getState().createGoal({ title: 'Manual goal', userId: USER, isPro: false });
    expect(captureSpy).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.GOAL_CREATED,
      expect.objectContaining({ method: 'manual' }),
    );
  });

  test('passes through method: "ai" when the caller specifies it', async () => {
    await useGoalsStore
      .getState()
      .createGoal({ title: 'AI goal', userId: USER, isPro: false, method: 'ai' });
    expect(captureSpy).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.GOAL_CREATED,
      expect.objectContaining({ method: 'ai' }),
    );
  });
});
