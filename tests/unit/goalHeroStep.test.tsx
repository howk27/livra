import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

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
    withTiming: (v: any, _cfg?: any, cb?: (finished: boolean) => void) => {
      cb?.(true);
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
  return new Proxy(
    {},
    {
      get: (_: any, name: string) => (name === '__esModule' ? true : stub),
    },
  );
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

import { GoalHeroStep } from '../../components/ui/GoalHeroStep';

const step = {
  kind: 'step' as const,
  candidate: {
    markId: 'a',
    name: 'Run',
    weeklyCount: 2,
    weeklyTarget: 3,
    loggedToday: false,
    timeAffinity: 'daytime' as const,
  },
};

describe('GoalHeroStep', () => {
  it('renders the directive step without a weekly fraction (QC 2026-07-12: one progress voice per card)', () => {
    const { getByText, queryByText } = render(<GoalHeroStep result={step} onLog={jest.fn()} />);
    getByText('Today');
    getByText('Run');
    expect(queryByText('2 of 3 this week')).toBeNull();
  });

  it('fires onLog with the mark id', () => {
    const onLog = jest.fn();
    const { getByTestId } = render(<GoalHeroStep result={step} onLog={onLog} />);
    fireEvent.press(getByTestId('hero-checkin'));
    expect(onLog).toHaveBeenCalledWith('a');
  });

  it('renders the quiet tomorrow state without a check-in button', () => {
    const { getByText, queryByTestId } = render(
      <GoalHeroStep result={{ kind: 'tomorrow', candidate: step.candidate }} onLog={jest.fn()} />,
    );
    getByText('Tomorrow: Run');
    expect(queryByTestId('hero-checkin')).toBeNull();
  });

  it('renders the all-clear state', () => {
    const { getByText } = render(<GoalHeroStep result={{ kind: 'allClear' }} onLog={jest.fn()} />);
    getByText("That's this goal for today.");
  });
});
