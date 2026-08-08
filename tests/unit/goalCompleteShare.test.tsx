import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ goalTitle: 'Run a 5K', goalId: 'goal-1' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: false }),
}));

jest.mock('../../lib/sharing/generateShareCard', () => ({
  generateShareCard: jest.fn().mockResolvedValue('file:///tmp/card.jpg'),
}));

// M9 Phase 5A Task 6: the screen reads the goals QUERY, not the retired store.
jest.mock('../../lib/data/goals', () => ({
  useGoals: jest.fn(() => ({ data: [], isLoading: false, error: null })),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Medium: 'medium' },
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

// Mock SharePreviewModal — render Save to Photos button when visible so we can assert modal opened
jest.mock('../../components/SharePreviewModal', () => {
  const React = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    SharePreviewModal: ({ visible, onSave, saveLabel }: any) => {
      if (!visible) return null;
      return React.createElement(
        TouchableOpacity,
        { onPress: onSave, accessibilityLabel: saveLabel },
        React.createElement(Text, null, saveLabel ?? 'Save to Photos')
      );
    },
  };
});

// add slice mock
jest.mock('../../state/shareCardSlice', () => {
  const { DEFAULT_SHARE_CARD_STYLE } = require('../../lib/sharing/shareCardThemes');
  return {
    useShareCardStore: jest.fn((fn: any) =>
      fn({ style: DEFAULT_SHARE_CARD_STYLE, updateStyle: jest.fn(), loadShareCardStyle: jest.fn() })
    ),
  };
});

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

import GoalCompleteScreen from '../../app/goal/complete';
import { checkProStatus } from '../../lib/iap/iap';

// Founder ruling 2026-08-08: the share card is HIDDEN and does not ship in V2
// (lib/sharing/shareCardEnabled.ts). These used to pin "Share this moment" as
// reachable and a free user reaching the modal without a paywall bounce; they
// now pin the hide. Re-enabling the flag turns them red on purpose — the
// reachability claims below are the ones to restore when it comes back.
describe('GoalCompleteScreen share integration (hidden)', () => {
  it('does not render the "Share this moment" button', () => {
    const { queryByText } = render(<GoalCompleteScreen />);
    expect(queryByText('Share this moment')).toBeNull();
  });

  it('never checks Pro status, because there is no share entry point to gate', async () => {
    render(<GoalCompleteScreen />);
    await waitFor(() => expect(checkProStatus).not.toHaveBeenCalled());
  });

  it('leaves the completion screen itself intact', () => {
    const { getByText, queryByText } = render(<GoalCompleteScreen />);
    expect(getByText('Continue')).toBeTruthy();
    expect(queryByText('Save to Photos')).toBeNull();
  });
});
