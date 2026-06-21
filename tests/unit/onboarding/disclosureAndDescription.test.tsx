/**
 * Tasks 10-11 — Upfront AI disclosure + editable description in AI review.
 *
 * Task 10: The disclosure text must be visible on step 1 BEFORE the user
 *   triggers generation. It surfaces the one-time nature of the AI draft so
 *   the user can make an informed choice.
 *
 * Task 11: The AI review screen must render an editable description field and
 *   confirm must carry that description into the created goal.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ─── Heavy native-module mocks (must come before component import) ────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, null, children);
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    Text: (props: any) => React.createElement(Text, props),
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    runOnJS: (fn: any) => fn,
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    FadeOut: { duration: () => ({}) },
    SlideInDown: { springify: () => ({}) },
    SlideOutDown: { springify: () => ({}) },
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    Gesture: { Pan: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) },
  };
});

jest.mock('phosphor-react-native', () => ({
  Check: () => null,
}));

jest.mock('../../../components/ui/SvgLogo', () => ({
  SvgLogo: () => null,
}));

jest.mock('../../../components/ui/LivraWordmark', () => ({
  LivraWordmark: () => null,
}));

jest.mock('../../../components/ui/PillButton', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    PillButton: ({ label, onPress, disabled }: any) =>
      React.createElement(
        TouchableOpacity,
        { onPress, disabled, accessibilityLabel: label },
        React.createElement(Text, null, label),
      ),
  };
});

jest.mock('../../../components/ui/MarkFrequencyPicker', () => ({
  frequencyLabel: (n: number) => `${n}x/wk`,
}));

jest.mock('../../../lib/ai/goalGeneration', () => ({
  generateGoalPackage: jest.fn(),
  resolveMarkForAIIcon: (icon: string) => ({ markId: icon, emoji: '🏃', color: '#4A6A8C' }),
  writeGoalPackageCache: jest.fn().mockResolvedValue(undefined),
  MIN_GOAL_LENGTH: 10,
}));

jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../../../state/uiSlice', () => ({
  useEffectiveTheme: () => 'light',
  useUIStore: (fn: any) => fn({ completeOnboarding: jest.fn().mockResolvedValue(undefined) }),
}));

const mockCreateGoal = jest.fn().mockResolvedValue({ id: 'goal-1' });
const mockLinkMarkToGoal = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../state/goalsSlice', () => ({
  useGoalsStore: (fn: any) =>
    fn({
      createGoal: mockCreateGoal,
      linkMarkToGoal: mockLinkMarkToGoal,
    }),
}));

jest.mock('../../../state/countersSlice', () => ({
  useMarksStore: (fn: any) =>
    fn({
      addMark: jest.fn().mockResolvedValue({ id: 'mark-1' }),
    }),
}));

jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  }),
}));

import OnboardingScreen from '../../../app/onboarding';
import { useOnboardingStore } from '../../../state/onboardingSlice';
import { generateGoalPackage } from '../../../lib/ai/goalGeneration';

const SAMPLE_PACKAGE = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high' as const,
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance over time' },
    { name: 'Rest day', icon: 'rest', frequency: 2, why: 'Prevents overtraining' },
  ],
};

function renderAtStep1() {
  useOnboardingStore.getState().reset();
  // Set step to 1 by passing through step 0 — but OnboardingScreen starts at step 0.
  // We use the store's goal title to drive step 1 visibility; we need to advance past step 0.
  const result = render(<OnboardingScreen />);
  // Press "Get Started" to advance to step 1
  fireEvent.press(result.getByText('Get Started'));
  return result;
}

// ─── Task 10: Upfront disclosure ─────────────────────────────────────────────

describe('Task 10: upfront AI disclosure in onboarding step 1', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
    jest.clearAllMocks();
  });

  test('disclosure text is visible on step 1 before generation is triggered', () => {
    const { getByText } = renderAtStep1();
    expect(getByText(/one free AI draft/i)).toBeTruthy();
  });

  test('disclosure is present in the AI hatch area, not behind a paywall', () => {
    const { queryByText } = renderAtStep1();
    // The text must exist (not null) even when no error has occurred
    expect(queryByText(/one free AI draft/i)).not.toBeNull();
  });
});

// ─── Task 11: Editable description in AI review ───────────────────────────────

describe('Task 11: editable description in AI review', () => {
  const mockGenerateGoalPackage = generateGoalPackage as jest.MockedFunction<
    typeof generateGoalPackage
  >;

  beforeEach(() => {
    useOnboardingStore.getState().reset();
    jest.clearAllMocks();
    mockGenerateGoalPackage.mockResolvedValue({ ok: true, package: SAMPLE_PACKAGE, source: 'api' });
  });

  test('AI review renders a description input field', async () => {
    const { getByText, findByPlaceholderText } = renderAtStep1();

    // Set goal title in store directly
    await act(async () => {
      useOnboardingStore.getState().setGoalTitle('Run a half marathon in 12 weeks');
    });

    // Press the AI generate button
    await act(async () => {
      fireEvent.press(getByText('✦ Let Livra suggest a plan'));
    });

    // Description input should be visible in AI review
    const descInput = await findByPlaceholderText(/Add a note about this goal/i, {}, 15000);
    expect(descInput).toBeTruthy();
  }, 20000);

  test('description starts blank in the AI review (AIGoalPackage has no description)', async () => {
    const { getByText, findByPlaceholderText } = renderAtStep1();

    await act(async () => {
      useOnboardingStore.getState().setGoalTitle('Run a half marathon in 12 weeks');
    });

    await act(async () => {
      fireEvent.press(getByText('✦ Let Livra suggest a plan'));
    });

    const descInput = await findByPlaceholderText(/Add a note about this goal/i, {}, 15000);
    // Value starts blank — AIGoalPackage has no description field
    expect(descInput.props.value).toBe('');
  }, 20000);

  test('edited description is threaded into createGoal on AI review confirm', async () => {
    const { getByText, findByPlaceholderText, findByText } = renderAtStep1();

    await act(async () => {
      useOnboardingStore.getState().setGoalTitle('Run a half marathon in 12 weeks');
    });

    // Trigger AI generation
    await act(async () => {
      fireEvent.press(getByText('✦ Let Livra suggest a plan'));
    });

    // Wait for AI review to appear and edit the description
    const descInput = await findByPlaceholderText(/Add a note about this goal/i, {}, 15000);
    await act(async () => {
      fireEvent.changeText(descInput, 'my test note');
    });

    // Confirm AI review — advances to step 3 (marks screen)
    await act(async () => {
      fireEvent.press(getByText('Looks good →'));
    });

    // Advance through step 3 marks screen to trigger handleMarksNext → createGoal
    const continueBtn = await findByText('Continue', {}, 5000);
    await act(async () => {
      fireEvent.press(continueBtn);
    });

    // createGoal must have been called with the edited description
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'my test note' }),
    );
  }, 30000);
});
