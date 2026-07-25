// tests/unit/nextMoveCard.test.tsx
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/markRow.test.tsx /
// markRowCelebrate.test.tsx — the hero swap entrance runs through the same
// Reanimated + useMotion gateway MarkRow's celebration pulse uses.
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
    withDelay: (_d: number, v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

// Stub every phosphor glyph as a plain View, preserving whatever testID/props
// the component sets — lets tests tell the check indicator from the empty
// circle indicator without caring about the real glyph.
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_: any, name: string) => {
        if (name === '__esModule') return true;
        return (props: any) => React.createElement(View, { testID: props.testID ?? `icon-${name}`, ...props });
      },
    },
  );
});

import { NextMoveCard } from '../../components/NextMoveCard';
import type { Counter } from '../../types';

const hero = { id: 'run', name: 'Run', emoji: '🏃' } as unknown as Counter;

const baseProps = {
  goalTitle: 'Get in shape',
  onGoalPress: jest.fn(),
  hero,
  comeback: null as null | { ask: string },
  onMarkIt: jest.fn(),
  onHeroLongPress: jest.fn(),
  chips: [] as Array<{ id: string; name: string; doneToday: boolean }>,
  overflowCount: 0,
  onChipPress: jest.fn(),
  onOverflowPress: jest.fn(),
};

describe('NextMoveCard — hero', () => {
  it('renders the hero name and the Mark it CTA', () => {
    const { getByText } = render(<NextMoveCard {...baseProps} />);
    expect(getByText('Run')).toBeTruthy();
    expect(getByText('Mark it')).toBeTruthy();
  });

  it('pressing Mark it calls onMarkIt', () => {
    const onMarkIt = jest.fn();
    const { getByText } = render(<NextMoveCard {...baseProps} onMarkIt={onMarkIt} />);
    fireEvent.press(getByText('Mark it'));
    expect(onMarkIt).toHaveBeenCalledTimes(1);
  });
});

describe('NextMoveCard — microlabel + comeback state', () => {
  it('shows NEXT MOVE when there is no comeback gap', () => {
    const { getByText, queryByText } = render(<NextMoveCard {...baseProps} />);
    expect(getByText('NEXT MOVE')).toBeTruthy();
    expect(queryByText('START BACK SMALL')).toBeNull();
  });

  it('shows START BACK SMALL + the ask when comeback is set', () => {
    const { getByText, queryByText } = render(
      <NextMoveCard {...baseProps} comeback={{ ask: 'A walk counts today.' }} />,
    );
    expect(getByText('START BACK SMALL')).toBeTruthy();
    expect(getByText('A walk counts today.')).toBeTruthy();
    expect(queryByText('NEXT MOVE')).toBeNull();
  });
});

describe('NextMoveCard — up-next chips', () => {
  const chips = [
    { id: 'stretch', name: 'Stretch', doneToday: false },
    { id: 'mealprep', name: 'Meal prep', doneToday: true },
  ];

  it('renders each chip name', () => {
    const { getByText } = render(<NextMoveCard {...baseProps} chips={chips} />);
    expect(getByText('Stretch')).toBeTruthy();
    expect(getByText('Meal prep')).toBeTruthy();
  });

  it('renders a check indicator for a doneToday chip and an empty circle for a pending one', () => {
    const { getByTestId } = render(<NextMoveCard {...baseProps} chips={chips} />);
    expect(getByTestId('next-move-chip-circle-stretch')).toBeTruthy();
    expect(getByTestId('next-move-chip-check-mealprep')).toBeTruthy();
  });

  it('tapping a chip calls onChipPress with its mark id', () => {
    const onChipPress = jest.fn();
    const { getByText } = render(
      <NextMoveCard {...baseProps} chips={chips} onChipPress={onChipPress} />,
    );
    fireEvent.press(getByText('Stretch'));
    expect(onChipPress).toHaveBeenCalledWith('stretch');
  });

  it('renders a +N overflow chip when overflowCount > 0 and routes it to onOverflowPress', () => {
    const onOverflowPress = jest.fn();
    const { getByText } = render(
      <NextMoveCard {...baseProps} chips={chips} overflowCount={3} onOverflowPress={onOverflowPress} />,
    );
    const overflow = getByText('+3');
    fireEvent.press(overflow);
    expect(onOverflowPress).toHaveBeenCalledTimes(1);
  });

  it('renders no +N chip when overflowCount is 0', () => {
    const { queryByText } = render(<NextMoveCard {...baseProps} chips={chips} overflowCount={0} />);
    expect(queryByText(/^\+/)).toBeNull();
  });

  it('recedes on a comeback but stays tappable (spec §3)', () => {
    const onChipPress = jest.fn();
    const { getByText, getByTestId } = render(
      <NextMoveCard
        {...baseProps}
        chips={chips}
        comeback={{ ask: 'A walk counts today.' }}
        onChipPress={onChipPress}
      />,
    );
    const flat = StyleSheet.flatten(getByTestId('next-move-chip-strip').props.style);
    expect(flat.opacity).toBeLessThan(1);
    // Dimmed is not disabled — the other marks are still one tap away.
    fireEvent.press(getByText('Stretch'));
    expect(onChipPress).toHaveBeenCalledWith('stretch');
  });

  it('is at full strength when there is no comeback', () => {
    const { getByTestId } = render(<NextMoveCard {...baseProps} chips={chips} />);
    const flat = StyleSheet.flatten(getByTestId('next-move-chip-strip').props.style);
    expect(flat.opacity ?? 1).toBe(1);
  });
});

describe('NextMoveCard — goal title', () => {
  it('renders the goal title and routes a tap to onGoalPress', () => {
    const onGoalPress = jest.fn();
    const { getByText } = render(<NextMoveCard {...baseProps} onGoalPress={onGoalPress} />);
    fireEvent.press(getByText('Get in shape'));
    expect(onGoalPress).toHaveBeenCalledTimes(1);
  });
});

describe('NextMoveCard — accessibility labels', () => {
  it('the hero mark-it control carries the exact contract label', () => {
    const { getByLabelText } = render(<NextMoveCard {...baseProps} />);
    const el = getByLabelText('Get in shape, next move: Run. Double-tap to mark it.');
    expect(el).toBeTruthy();
    fireEvent.press(el);
    expect(baseProps.onMarkIt).toHaveBeenCalled();
  });

  it('a chip carries the exact contract label and role', () => {
    const { getByLabelText } = render(
      <NextMoveCard {...baseProps} chips={[{ id: 'stretch', name: 'Stretch', doneToday: false }]} />,
    );
    const el = getByLabelText('Stretch, up next. Tap to make it the next move.');
    expect(el.props.accessibilityRole).toBe('button');
  });
});

describe('NextMoveCard — no fractions, no inkMuted', () => {
  const SRC = readFileSync(
    join(__dirname, '../../components/NextMoveCard.tsx'),
    'utf8',
  );

  it('never reaches for the banned inkMuted token', () => {
    expect(SRC).not.toMatch(/c\.inkMuted/);
  });

  it('renders no % or / anywhere in the card copy (checks/circles only, no fractions)', () => {
    const chips = [
      { id: 'stretch', name: 'Stretch', doneToday: false },
      { id: 'mealprep', name: 'Meal prep', doneToday: true },
    ];
    const tree = render(
      <NextMoveCard
        {...baseProps}
        chips={chips}
        overflowCount={2}
        comeback={{ ask: 'A walk counts today.' }}
      />,
    );

    const collectText = (node: any): string[] => {
      if (node == null) return [];
      if (typeof node === 'string') return [node];
      if (Array.isArray(node)) return node.flatMap(collectText);
      if (typeof node === 'object' && 'children' in node) return collectText(node.children);
      return [];
    };

    const allText = collectText(tree.toJSON()).join(' ');
    expect(allText).not.toContain('%');
    expect(allText).not.toContain('/');
  });
});
