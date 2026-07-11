// tests/unit/markRow.test.tsx
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
      <MarkRow title="Read" category="custom" done showWeeklyCount weeklyCount={3} weeklyTarget={3} testID="mark-row" />,
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
    const { getByText, getByTestId } = render(
      <MarkRow title="Read" category="custom" showWeeklyCount weeklyCount={1} weeklyTarget={3} testID="mark-row" />,
    );
    const title = getByText('Read');
    const flat = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    expect(flat.textDecorationLine).toBeUndefined();
    const row = getByTestId('mark-row');
    expect(row.props.accessibilityState?.checked).toBeUndefined();
  });
});

/**
 * Launch walk 2026-07-08, bug item 1: weekly rows must keep a one-tap
 * check-in. `showWeeklyCount` gates only the progress bar; the right column
 * always offers the CheckinButton, driven by `loggedToday` (did the user log
 * TODAY), never by weekly-done state.
 */
describe('MarkRow weekly check-in affordance', () => {
  it('renders a tappable check-in on a weekly row and logs in one tap', () => {
    const onLog = jest.fn();
    const { getByTestId } = render(
      <MarkRow
        title="Run"
        category="custom"
        showWeeklyCount
        weeklyCount={1}
        weeklyTarget={3}
        onLog={onLog}
        testID="mark-row"
      />,
    );
    fireEvent.press(getByTestId('mark-row-checkin'));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('keeps the check-in tappable when the weekly target is met but nothing was logged today', () => {
    const onLog = jest.fn();
    const { getByTestId } = render(
      <MarkRow
        title="Run"
        category="custom"
        done
        showWeeklyCount
        weeklyCount={3}
        weeklyTarget={3}
        onLog={onLog}
        testID="mark-row"
      />,
    );
    fireEvent.press(getByTestId('mark-row-checkin'));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('shows the checked state (no tappable button) once logged today', () => {
    const onLog = jest.fn();
    const { queryByTestId } = render(
      <MarkRow
        title="Run"
        category="custom"
        loggedToday
        showWeeklyCount
        weeklyCount={2}
        weeklyTarget={3}
        onLog={onLog}
        testID="mark-row"
      />,
    );
    // Checked CheckinButton renders a static filled circle, not a touchable.
    expect(queryByTestId('mark-row-checkin')).toBeNull();
  });

  it('no longer renders the bare numeric weekly count (progress bar carries it)', () => {
    const { queryByText } = render(
      <MarkRow
        title="Run"
        category="custom"
        showWeeklyCount
        weeklyCount={2}
        weeklyTarget={3}
        onLog={jest.fn()}
        testID="mark-row"
      />,
    );
    expect(queryByText('2')).toBeNull();
  });
});
