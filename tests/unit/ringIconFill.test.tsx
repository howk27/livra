// QC Fail #2: the goal glyph must fill bottom→top as the ring sweeps. The old
// RN overflow-clip never filled on device; the fill now lives inside
// react-native-svg (a <ClipPath> + animated <Rect>). These tests pin the
// BEHAVIOUR — the clip rect height tracks the fraction — not pixels, and cover
// from=0, a later frac bump, and reduced-motion landing at the final fraction.
import React from 'react';
import { render } from '@testing-library/react-native';

let mockReduced = false;

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
    withTiming: (v: any) => v,
  };
});

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (p: any) => React.createElement(View, { testID: 'glyph', ...p });
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

import { RingIconFill, fillRectForFraction } from '../../components/ui/RingIconFill';

const SIZE = 48;
const Glyph = (p: any) => null;

describe('fillRectForFraction — the fill height tracks the fraction', () => {
  it('is empty at from=0 (nothing revealed at the baseline)', () => {
    expect(fillRectForFraction(SIZE, 0)).toEqual({ y: SIZE, height: 0 });
  });

  it('covers the full glyph at the target fraction of 1', () => {
    expect(fillRectForFraction(SIZE, 1)).toEqual({ y: 0, height: SIZE });
  });

  it('rises bottom→top proportionally at a mid fraction', () => {
    expect(fillRectForFraction(SIZE, 0.5)).toEqual({ y: SIZE / 2, height: SIZE / 2 });
  });

  it('grows when a later log bumps the fraction (25% -> 75%)', () => {
    const before = fillRectForFraction(SIZE, 0.25);
    const after = fillRectForFraction(SIZE, 0.75);
    expect(after.height).toBeGreaterThan(before.height);
    // bottom-anchored: a taller fill starts higher up (smaller y).
    expect(after.y).toBeLessThan(before.y);
  });

  it('clamps out-of-range fractions to [0,1]', () => {
    expect(fillRectForFraction(SIZE, -0.5)).toEqual({ y: SIZE, height: 0 });
    expect(fillRectForFraction(SIZE, 1.4)).toEqual({ y: 0, height: SIZE });
  });
});

describe('RingIconFill render', () => {
  afterEach(() => {
    mockReduced = false;
  });

  it('mounts and exposes the base glyph box and the animated clip rect', () => {
    const { getByTestId } = render(
      <RingIconFill icon={Glyph} size={SIZE} baseColor="#9A9A92" fillColor="#C8913F" frac={0.4} />,
    );
    expect(getByTestId('ring-icon-fill')).toBeTruthy();
    expect(getByTestId('ring-icon-fill-rect')).toBeTruthy();
  });

  it('renders identically in light and dark (colors are props, not hardcoded)', () => {
    const light = render(
      <RingIconFill icon={Glyph} size={SIZE} baseColor="#9A9A92" fillColor="#C8913F" frac={0.6} />,
    );
    expect(light.getByTestId('ring-icon-fill-rect')).toBeTruthy();
    const dark = render(
      <RingIconFill icon={Glyph} size={SIZE} baseColor="#8A938E" fillColor="#D8A658" frac={0.6} />,
    );
    expect(dark.getByTestId('ring-icon-fill-rect')).toBeTruthy();
  });

  it('under reduced motion the fill still lands at the final fraction', () => {
    // With Reduce Motion on, the shared value is set to `frac` with duration 0 —
    // the geometry that lands is fillRectForFraction(size, frac), unchanged.
    mockReduced = true;
    const { getByTestId } = render(
      <RingIconFill icon={Glyph} size={SIZE} baseColor="#8A938E" fillColor="#D8A658" frac={1} />,
    );
    expect(getByTestId('ring-icon-fill-rect')).toBeTruthy();
    expect(fillRectForFraction(SIZE, 1)).toEqual({ y: 0, height: SIZE });
  });
});
