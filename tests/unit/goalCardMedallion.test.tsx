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
import { resolveMarkAccent, resolveGoalAccent } from '../../lib/markCategoryResolve';
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

  // SUPERSEDED (founder call, 2026-08-06). These two asserted that the medallion
  // wears the DOMINANT (most-logged) mark's own accent, and that flipping the
  // totals flips the face. That rule was replaced because of what it does on a
  // NEW goal: every mark has zero logs, so they all tie, and `dominantMark`'s
  // first-wins tie-break meant a fresh goal ALWAYS wore its first mark's icon —
  // then silently changed once logging began. Two AI-created goals showed the
  // identical face, which is how it surfaced.
  //
  // The goal's face now comes from the GOAL'S OWN WORDS and is stable from
  // creation. The marks survive only as a fallback for a goal whose text matches
  // nothing, and then only to pick a CATEGORY.
  it('takes its accent from the goal’s own title, not from any mark', () => {
    // NB "Save $5k" is deliberately NOT used here: its signature mark (`saving`)
    // has no picker twin, so its accent is HASHED — and that hash lands on
    // #4F8295, which is byte-identical to iconAccents.water. Real collision,
    // pre-existing, filed rather than fixed (rehashing would repaint existing
    // goals). It would have made this assertion pass or fail for the wrong
    // reason, so the case uses a title whose accent is genuinely distinct.
    const tree = render(<GoalCardMedallion title="Learn Spanish" marks={[sleep, water]} />);
    expect(iconColor(tree)).toBe(resolveGoalAccent({ title: 'Learn Spanish' }));
    // Explicitly NOT the dominant mark's accent (water, total 5).
    expect(iconColor(tree)).not.toBe(resolveMarkAccent(water));
    expect(iconColor(tree)).not.toBe(resolveMarkAccent(sleep));
  });

  it('does not change when the marks or their totals change', () => {
    const face = (marks: Mark[]) =>
      iconColor(render(<GoalCardMedallion title="Learn Spanish" marks={marks} />));
    expect(face([sleep, water])).toBe(
      face([{ ...sleep, total: 9 } as Mark, { ...water, total: 1 } as Mark]),
    );
    expect(face([sleep, water])).toBe(face([]));
  });

  it('falls back to the marks’ category only when the title matches nothing', () => {
    const tree = render(<GoalCardMedallion title="???" marks={[sleep]} />);
    expect(iconColor(tree)).toBe(CATEGORY_MAP.Recovery.accent);
  });

  it('falls back to the custom glyph/accent for a goal with no marks', () => {
    const tree = render(<GoalCardMedallion marks={[]} />);
    expect(iconColor(tree)).toBe(CATEGORY_MAP.custom.accent);
  });
});
