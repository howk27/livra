// tests/unit/checkinButtonPulse.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
    withTiming: (v: any, _c?: any, cb?: (finished: boolean) => void) => {
      if (cb) cb(true);
      return v;
    },
    withSequence: (v: any) => v,
    withSpring: (v: any) => v,
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

import { CheckinButton } from '../../components/ui/CheckinButton';

describe('CheckinButton accent pulse', () => {
  it('renders a pulse ring element when an accent is provided', () => {
    const { getByTestId } = render(
      <CheckinButton checked={false} onCheckin={jest.fn()} accent="#5B8C5A" />,
    );
    expect(getByTestId('checkin-pulse-ring')).toBeTruthy();
  });

  it('still fires onCheckin on press', () => {
    const onCheckin = jest.fn();
    const { getByTestId } = render(
      <CheckinButton checked={false} onCheckin={onCheckin} accent="#5B8C5A" testID="btn" />,
    );
    fireEvent.press(getByTestId('btn'));
    // withTiming's completion callback runs synchronously in the mock above.
    expect(onCheckin).toHaveBeenCalled();
  });
});
