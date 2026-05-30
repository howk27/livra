import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ goalTitle: 'Run a 5K', goalId: 'goal-1' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: true }),
}));

jest.mock('../../lib/sharing/generateShareCard', () => ({
  generateShareCard: jest.fn().mockResolvedValue('file:///tmp/card.jpg'),
}));

jest.mock('../../state/goalsSlice', () => ({
  useGoalsStore: jest.fn((fn: any) => fn({ goals: [] })),
}));

jest.mock('../../state/xpSlice', () => ({
  useXPStore: jest.fn((fn: any) => fn({ totalXP: 1000 })),
}));

jest.mock('../../lib/xpEngine', () => ({
  getLevelForXP: () => 4,
  LEVEL_TITLES: ['Beginner', 'Committed', 'Consistent', 'Focused'],
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    Text: (props: any) => {
      const { Text } = require('react-native');
      return React.createElement(Text, props);
    },
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => ({}),
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
    withDelay: (_: any, v: any) => v,
  };
});
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'dark' }));
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date('2026-05-30T12:00:00.000Z') }));

// Mock the components that need native modules
jest.mock('../../components/GoalCompletionShareCard', () => ({
  GoalCompletionShareCard: () => null,
}));
jest.mock('../../components/SharePreviewModal', () => ({
  SharePreviewModal: () => null,
}));

import GoalCompleteScreen from '../../app/goal/complete';
import { checkProStatus } from '../../lib/iap/iap';

describe('GoalCompleteScreen share integration', () => {
  it('renders "Share this moment" button', () => {
    const { getByText } = render(<GoalCompleteScreen />);
    expect(getByText('Share this moment')).toBeTruthy();
  });

  it('calls checkProStatus when share button is pressed', async () => {
    const { getByText } = render(<GoalCompleteScreen />);
    fireEvent.press(getByText('Share this moment'));
    await waitFor(() => {
      expect(checkProStatus).toHaveBeenCalled();
    });
  });
});
