import React from 'react';
import { render } from '@testing-library/react-native';

// Reanimated / haptics aren't exercised by the medallion, but MarkRow (source of
// CATEGORY_MAP) pulls them in — stub so the module graph loads under Jest.
jest.mock('react-native-reanimated', () => {
  const Rn = require('react-native');
  const Animated = { View: Rn.View, createAnimatedComponent: (C: any) => C };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    withSequence: (v: any) => v,
    withSpring: (v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

// Each phosphor icon renders a probe carrying the `color` prop the medallion set.
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (props: any) => React.createElement(View, { testID: 'medallion-icon', ...props });
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

import { GoalCardMedallion } from '../../components/goals/GoalCardMedallion';
import { CATEGORY_MAP } from '../../components/ui/MarkRow';
import { resolveMarkAccent } from '../../lib/markCategoryResolve';
import type { Mark } from '../../types';

// Two library marks with distinct per-icon accents.
const sleep = { id: 's', name: 'Sleep', emoji: '🌙', total: 1 } as unknown as Mark;
const water = { id: 'w', name: 'Water', emoji: '💧', total: 5 } as unknown as Mark;

const iconColor = (tree: ReturnType<typeof render>) =>
  tree.getByTestId('medallion-icon').props.color;

describe('GoalCardMedallion', () => {
  it('precondition: the two marks resolve to different accents', () => {
    expect(resolveMarkAccent(sleep)).not.toBe(resolveMarkAccent(water));
  });

  it('renders an icon tinted with the DOMINANT (most-logged) mark’s own accent', () => {
    // Water has the higher total → it is the dominant mark.
    const tree = render(<GoalCardMedallion marks={[sleep, water]} />);
    expect(iconColor(tree)).toBe(resolveMarkAccent(water));
  });

  it('follows the marks: flipping the totals flips the resolved icon accent', () => {
    const tree = render(
      <GoalCardMedallion
        marks={[
          { ...sleep, total: 9 } as Mark,
          { ...water, total: 1 } as Mark,
        ]}
      />,
    );
    expect(iconColor(tree)).toBe(resolveMarkAccent(sleep));
  });

  it('falls back to the custom glyph/accent for a goal with no marks', () => {
    const tree = render(<GoalCardMedallion marks={[]} />);
    expect(iconColor(tree)).toBe(CATEGORY_MAP.custom.accent);
  });
});
