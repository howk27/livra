// tests/unit/goalMomentumComponent.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/goalCompleteShare.test.tsx
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View: (p: any) => React.createElement(View, p) },
    View: (p: any) => React.createElement(View, p),
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any) => v,
  };
});

import { GoalMomentum } from '../../components/ui/GoalMomentum';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot>): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

describe('GoalMomentum', () => {
  it('shows Fresh start for a null snapshot', () => {
    const { getByText } = render(<GoalMomentum snapshot={null} />);
    expect(getByText('Fresh start')).toBeTruthy();
  });
  it('shows the day count when on track', () => {
    const { getByText } = render(<GoalMomentum snapshot={snap({ state: 'on_track', days: 12 })} />);
    expect(getByText('Momentum · 12 days')).toBeTruthy();
  });
  it('renders the cushion gauge only when slipping', () => {
    const slipping = render(<GoalMomentum snapshot={snap({ state: 'slipping', days: 6, cushionRemaining: 0.5 })} />);
    expect(slipping.getByTestId('momentum-cushion-gauge')).toBeTruthy();
    const onTrack = render(<GoalMomentum snapshot={snap({ state: 'on_track', days: 6 })} />);
    expect(onTrack.queryByTestId('momentum-cushion-gauge')).toBeNull();
  });
});
