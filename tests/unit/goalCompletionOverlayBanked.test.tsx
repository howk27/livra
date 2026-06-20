// tests/unit/goalCompletionOverlayBanked.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// ── Native-module mocks (must precede the component import) ──────────────────
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

jest.mock('expo-haptics', () => ({
  // .catch() is called on the result, so this MUST resolve a promise.
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const chain = () => {
    const g: any = {};
    g.onUpdate = () => g;
    g.onEnd = () => g;
    return g;
  };
  return {
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    Gesture: { Pan: () => chain() },
  };
});

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
  };
});

import { GoalCompletionOverlay } from '../../components/overlays/GoalCompletionOverlay';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';
import { useGoalsStore } from '../../state/goalsSlice';
import type { Goal } from '../../types/goal';

const makeGoal = (o: Partial<Goal>): Goal => ({
  id: 'g1', user_id: 'u1', title: 'Run a 5k', status: 'completed', sort_index: 0,
  current_mark_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...o,
});

describe('GoalCompletionOverlay banked momentum line', () => {
  beforeEach(() => {
    useGoalsStore.setState({ goals: [] } as any);
  });

  it('shows the banked line when days > 0', () => {
    const goal = makeGoal({ banked_momentum_days: 9 });
    useGoalCompletionStore.setState({ completedGoal: goal, show: true } as any);
    const { getByText } = render(<GoalCompletionOverlay />);
    expect(getByText('Finished with 9 days of momentum')).toBeTruthy();
  });

  it('shows nothing extra when banked is 0', () => {
    const goal = makeGoal({ banked_momentum_days: 0 });
    useGoalCompletionStore.setState({ completedGoal: goal, show: true } as any);
    const { queryByText } = render(<GoalCompletionOverlay />);
    expect(queryByText(/days of momentum/)).toBeNull();
    expect(queryByText(/day of momentum/)).toBeNull();
  });
});
