/**
 * M7-QC45 — the free-goal cap popup (#4) and the Goals subtitle on the avatar
 * row (#5).
 *
 * #4: the cap used to fire a raw iOS-native `Alert.alert` (founder: "handled by
 * iOS ... make it come from Livra directly"). These tests pin BOTH the new
 * Livra-styled in-app dialog (renders the shared GOAL_LIMIT_MESSAGE, a verb-first
 * "See Livra+" CTA and a "Not now" dismiss; visibility toggles) AND the guard
 * that the GoalLimitError branch in goal/new no longer calls Alert.alert.
 *
 * #5: the subtitle "Your goals, one at a time." renders inside the LivraHeader
 * row (beside the avatar) rather than the scroll body; the old topBlock is gone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Shared mocks (mirror checkinButtonPulse.test.tsx) ─────────────────────────
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
    withSpring: (v: any) => v,
  };
});

jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => React.createElement(View, null);
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GoalLimitDialog } from '../../components/ui/GoalLimitDialog';
import { GOAL_LIMIT_MESSAGE } from '../../lib/copy';

const ROOT = join(__dirname, '../../');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// ── #4: GoalLimitDialog component ─────────────────────────────────────────────

describe('GoalLimitDialog (QC-FAIL-4 in-app cap popup)', () => {
  it('renders the shared cap message and both actions when visible', () => {
    const { getByText } = render(
      <GoalLimitDialog visible onClose={jest.fn()} onSeePlus={jest.fn()} />,
    );
    expect(getByText(GOAL_LIMIT_MESSAGE)).toBeTruthy();
    expect(getByText('See Livra+')).toBeTruthy();
    expect(getByText('Not now')).toBeTruthy();
  });

  it('toggles the Modal visibility with the `visible` prop (not a native Alert)', () => {
    const { getByTestId, queryByText, rerender } = render(
      <GoalLimitDialog visible={false} onClose={jest.fn()} onSeePlus={jest.fn()} />,
    );
    // Hidden: the Modal renders no content (a native Alert would have no such
    // React-tree host to assert against — this IS an in-app surface).
    expect(queryByText(GOAL_LIMIT_MESSAGE)).toBeNull();
    rerender(<GoalLimitDialog visible onClose={jest.fn()} onSeePlus={jest.fn()} />);
    expect(getByTestId('goal-limit-dialog').props.visible).toBe(true);
    expect(queryByText(GOAL_LIMIT_MESSAGE)).toBeTruthy();
  });

  it('routes to Livra+ on the primary CTA and dismisses on "Not now"', () => {
    const onSeePlus = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <GoalLimitDialog visible onClose={onClose} onSeePlus={onSeePlus} />,
    );
    fireEvent.press(getByText('See Livra+'));
    expect(onSeePlus).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText('Not now'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── #4: goal/new no longer fires the native prompt on the cap branch ──────────

describe('goal/new cap path (QC-FAIL-4 source guard)', () => {
  const src = read('app/goal/new.tsx');

  it('renders the in-app GoalLimitDialog', () => {
    expect(src).toContain('GoalLimitDialog');
    expect(src).toMatch(/<GoalLimitDialog/);
  });

  it('sets the cap dialog visible on GoalLimitError instead of Alert.alert', () => {
    // Isolate the GoalLimitError branch (up to its `else`) and assert it drives
    // state, not a native prompt.
    const start = src.indexOf('err instanceof GoalLimitError');
    const branch = src.slice(start, src.indexOf(' else {', start));
    expect(branch).toContain('setCapVisible(true)');
    expect(branch).not.toContain('Alert.alert');
  });
});

// ── #5: subtitle lives on the header row ──────────────────────────────────────

jest.mock('../../hooks/useProfileAvatar', () => ({ useProfileAvatar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

import { LivraHeader } from '../../components/ui/LivraHeader';

describe('LivraHeader subtitle (QC-FAIL-5)', () => {
  it('renders the subtitle line within the header when showAvatar is set', () => {
    const { getByText } = render(
      <LivraHeader showAvatar subtitle="Your goals, one at a time." />,
    );
    expect(getByText('Your goals, one at a time.')).toBeTruthy();
  });

  it('does not render the subtitle when showBack claims the row', () => {
    const { queryByText } = render(
      <LivraHeader showBack subtitle="Your goals, one at a time." />,
    );
    expect(queryByText('Your goals, one at a time.')).toBeNull();
  });
});

describe('goals screen wiring (QC-FAIL-5 source guard)', () => {
  const src = read('app/(tabs)/goals.tsx');

  it('passes the subtitle to LivraHeader on the avatar row', () => {
    expect(src).toMatch(/<LivraHeader[^>]*subtitle="Your goals, one at a time\."/);
  });

  it('removes the old below-header topBlock subtitle', () => {
    expect(src).not.toContain('styles.topBlock');
    expect(src).not.toContain('topBlock:');
  });
});
