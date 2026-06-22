import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ── Native-module + heavy-dependency mocks (must precede the component import) ──
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

jest.mock('expo-haptics', () => ({
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

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: false }),
}));
jest.mock('../../lib/sharing/generateShareCard', () => ({
  generateShareCard: jest.fn().mockResolvedValue('file://card.jpg'),
}));
jest.mock('../../components/GoalCompletionShareCard', () => ({
  GoalCompletionShareCard: () => null,
}));
// Stub the modal so the test asserts the overlay's wiring (tap -> visible), not the modal internals.
jest.mock('../../components/SharePreviewModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SharePreviewModal: ({ visible, saveLabel }: any) =>
      visible ? React.createElement(Text, null, saveLabel) : null,
  };
});

import { GoalCompletionOverlay } from '../../components/overlays/GoalCompletionOverlay';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';

const goal: any = {
  id: 'g1',
  title: 'Run a marathon',
  status: 'completed',
  created_at: '2026-05-01T00:00:00.000Z',
  completed_at: '2026-06-01T00:00:00.000Z',
  current_mark_count: 30,
  banked_momentum_days: 12,
};

describe('GoalCompletionOverlay share', () => {
  it('opens the share modal when "Share your win" is tapped', async () => {
    useGoalCompletionStore.setState({ completedGoal: goal, show: true });
    const { getByText, queryByText } = render(<GoalCompletionOverlay />);
    expect(queryByText('Save to Photos')).toBeNull();
    fireEvent.press(getByText('Share your win'));
    await waitFor(() => expect(getByText('Save to Photos')).toBeTruthy());
  });
});
