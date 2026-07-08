// tests/unit/breathing.test.tsx
import React from 'react';
import { Text } from 'react-native';
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
    withRepeat: (v: any) => v,
    cancelAnimation: jest.fn(),
    Easing: { inOut: (f: any) => f, sin: jest.fn() },
  };
});

let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduced,
}));

import { Breathing } from '../../components/ui/Breathing';

describe('Breathing', () => {
  it('renders its children', () => {
    mockReduced = false;
    const { getByText } = render(
      <Breathing>
        <Text>hi</Text>
      </Breathing>,
    );
    expect(getByText('hi')).toBeTruthy();
  });

  it('renders (static) under Reduce Motion without crashing', () => {
    mockReduced = true;
    const { getByText } = render(
      <Breathing>
        <Text>hi</Text>
      </Breathing>,
    );
    expect(getByText('hi')).toBeTruthy();
    mockReduced = false;
  });
});
