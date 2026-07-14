// tests/unit/goalTitle.test.tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { GoalTitle } from '../../components/ui/GoalTitle';
import { colors, fonts, fontSize } from '../../theme/tokens';

const flatStyle = (el: any) => StyleSheet.flatten(el.props.style);

describe('GoalTitle', () => {
  it('renders the title text exactly as authored (no case transform)', () => {
    const { getByText } = render(<GoalTitle title="Run my first Marathon" />);
    expect(getByText('Run my first Marathon')).toBeTruthy();
  });

  it('clamps to 2 lines', () => {
    const { getByTestId } = render(<GoalTitle title="A very long goal title" />);
    expect(getByTestId('goal-title-text').props.numberOfLines).toBe(2);
  });

  it('card size (default): serif semibold 22/28, letterSpacing -0.3', () => {
    const { getByTestId } = render(<GoalTitle title="Get stronger" />);
    const s = flatStyle(getByTestId('goal-title-text'));
    expect(s.fontFamily).toBe(fonts.serifSemibold);
    expect(s.fontSize).toBe(fontSize[22]);
    expect(s.lineHeight).toBe(28);
    expect(s.letterSpacing).toBe(-0.3);
  });

  it('detail size: serif semibold 26 with proportional lineHeight', () => {
    const { getByTestId } = render(<GoalTitle title="Get stronger" size="detail" />);
    const s = flatStyle(getByTestId('goal-title-text'));
    expect(s.fontFamily).toBe(fonts.serifSemibold);
    expect(s.fontSize).toBe(fontSize[26]);
    expect(s.lineHeight).toBe(33);
  });

  it('flourish defaults: off for card, on for detail', () => {
    const card = render(<GoalTitle title="Get stronger" size="card" />);
    expect(card.queryByTestId('goal-title-flourish')).toBeNull();
    const detail = render(<GoalTitle title="Get stronger" size="detail" />);
    expect(detail.getByTestId('goal-title-flourish')).toBeTruthy();
  });

  it('flourish prop overrides the size default in both directions', () => {
    const cardOn = render(<GoalTitle title="Get stronger" size="card" flourish />);
    expect(cardOn.getByTestId('goal-title-flourish')).toBeTruthy();
    const detailOff = render(<GoalTitle title="Get stronger" size="detail" flourish={false} />);
    expect(detailOff.queryByTestId('goal-title-flourish')).toBeNull();
  });

  it('color prop overrides the default ink', () => {
    const { getByTestId } = render(<GoalTitle title="Get stronger" color={colors.inkInverse} />);
    expect(flatStyle(getByTestId('goal-title-text')).color).toBe(colors.inkInverse);
  });
});
