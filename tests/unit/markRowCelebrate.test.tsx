// tests/unit/markRowCelebrate.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/markRow.test.tsx
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any) => v,
    withSequence: (v: any) => v,
    withSpring: (v: any) => v,
    withDelay: (_d: number, v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => React.createElement(View, null);
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

import { MarkRow } from '../../components/ui/MarkRow';

describe('MarkRow day-complete celebration', () => {
  it('renders the celebration overlay when a celebrateStamp is provided', () => {
    const { getByTestId } = render(
      <MarkRow title="Read" loggedToday celebrateStamp={123} celebrateIndex={0} />,
    );
    expect(getByTestId('markrow-celebrate-overlay')).toBeTruthy();
  });

  it('renders no overlay without a stamp', () => {
    const { queryByTestId } = render(<MarkRow title="Read" loggedToday />);
    expect(queryByTestId('markrow-celebrate-overlay')).toBeNull();
  });
});
