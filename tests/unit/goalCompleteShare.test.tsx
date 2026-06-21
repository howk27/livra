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

jest.mock('../../state/goalsSlice', () => ({
  useGoalsStore: jest.fn((fn: any) => fn({ goals: [], getActiveGoal: () => null })),
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

  it('free user can open the share modal without being sent to the paywall', async () => {
    const push = jest.fn();
    jest.spyOn(require('expo-router'), 'useRouter').mockReturnValue({ replace: jest.fn(), push });
    const { getByText, findByText } = render(<GoalCompleteScreen />);
    fireEvent.press(getByText('Share this moment'));
    // modal opens; Save to Photos button visible; paywall NOT pushed
    expect(await findByText('Save to Photos')).toBeTruthy();
    expect(push).not.toHaveBeenCalledWith('/paywall');
  });
});
