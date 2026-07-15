// QC3-E: ProgressArc gains an optional two-stop gradient stroke for the goal
// ring. Existing callers that pass only `color` must keep the solid stroke
// (no gradient def emitted); callers passing `gradientColors` get a
// LinearGradient in Defs.
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (c: any) => c,
      View: (p: any) => React.createElement(View, p),
    },
    createAnimatedComponent: (c: any) => c,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedProps: (fn: any) => fn(),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any) => v,
  };
});

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

import { ProgressArc } from '../../components/ui/ProgressArc';

describe('ProgressArc gradient (QC3-E)', () => {
  it('emits a two-stop gradient when gradientColors is provided', () => {
    const { getByTestId, toJSON } = render(
      <ProgressArc
        from={0}
        to={0.4}
        color="#1C3830"
        trackColor="#E0DBD4"
        gradientColors={['#D8A658', '#C8913F']}
        gradientId="goalRingGradient"
      />,
    );
    expect(getByTestId('progress-arc')).toBeTruthy();
    const tree = JSON.stringify(toJSON());
    // A LinearGradient def is emitted and carries the caller's gradient id
    // (the arc stroke references it via url(#goalRingGradient)).
    expect(tree).toContain('RNSVGLinearGradient');
    expect(tree).toContain('goalRingGradient');
  });

  it('renders a solid stroke (no gradient def) for existing callers', () => {
    const { getByTestId, toJSON } = render(
      <ProgressArc from={0} to={0.4} color="#1C3830" trackColor="#E0DBD4" />,
    );
    expect(getByTestId('progress-arc')).toBeTruthy();
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('RNSVGLinearGradient');
    expect(tree).not.toContain('goalRingGradient');
  });
});
