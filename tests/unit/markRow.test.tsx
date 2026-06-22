// tests/unit/markRow.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

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
  return new Proxy(
    {},
    {
      get: (_: any, name: string) =>
        name === '__esModule' ? true : stub,
    },
  );
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

import { MarkRow } from '../../components/ui/MarkRow';

describe('MarkRow done cue', () => {
  it('strikes through the title and marks the row checked when done', () => {
    const { getByText, getByTestId } = render(
      <MarkRow title="Read" category="custom" done showWeeklyCount weeklyCount={3} weeklyTarget={3} />,
    );
    const title = getByText('Read');
    const flat = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    expect(flat.textDecorationLine).toBe('line-through');
    // RNTL v13 lacks getByA11yState — use testID + props inspection instead
    const row = getByTestId('mark-row');
    expect(row.props.accessibilityState).toEqual({ checked: true });
  });

  it('does not strike through the title when not done', () => {
    const { getByText } = render(
      <MarkRow title="Read" category="custom" showWeeklyCount weeklyCount={1} weeklyTarget={3} />,
    );
    const title = getByText('Read');
    const flat = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    expect(flat.textDecorationLine).toBeUndefined();
  });
});
