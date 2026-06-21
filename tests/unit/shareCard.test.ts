import React from 'react';
import { render } from '@testing-library/react-native';
import { GoalCompletionShareCard } from '../../components/GoalCompletionShareCard';
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

const defaultProps = {
  goalTitle: 'Run a 5K',
  completedDate: '2026-05-29',
  levelTitle: 'Focused',
  daysTaken: 42,
};

describe('GoalCompletionShareCard', () => {
  it('renders goal title', () => {
    const { getByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    expect(getByText('Run a 5K')).toBeTruthy();
  });

  it('renders completion copy', () => {
    const { getByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    expect(getByText("Done. That one's yours forever.")).toBeTruthy();
  });

  it('renders days taken', () => {
    const { getByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    expect(getByText('42 days')).toBeTruthy();
  });

  it('renders level title', () => {
    const { getByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    expect(getByText('Focused')).toBeTruthy();
  });

  it('renders targetDateLabel when provided', () => {
    const { getByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...defaultProps,
        targetDateLabel: 'Finished 3 days early',
      })
    );
    expect(getByText('Finished 3 days early')).toBeTruthy();
  });

  it('does not render targetDateLabel when not provided', () => {
    const { queryByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    expect(queryByText(/Finished/)).toBeNull();
  });

  it('renders formatted completion date', () => {
    const { getByText } = render(React.createElement(GoalCompletionShareCard, defaultProps));
    // completedDate is '2026-05-29' so expect "May 29, 2026"
    expect(getByText('May 29, 2026')).toBeTruthy();
  });
});

describe('GoalCompletionShareCard styling', () => {
  const base = {
    goalTitle: 'Run a 5K',
    completedDate: '2026-05-29',
    levelTitle: 'Focused',
    daysTaken: 42,
    bankedMomentumDays: 12,
  };

  it('hides the level badge when showBadge is false', () => {
    const { queryByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: { ...DEFAULT_SHARE_CARD_STYLE, showBadge: false },
      })
    );
    expect(queryByText('Focused')).toBeNull();
  });

  it('hides the date/days meta when showDate is false', () => {
    const { queryByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: { ...DEFAULT_SHARE_CARD_STYLE, showDate: false },
      })
    );
    expect(queryByText('42 days')).toBeNull();
  });

  it('always renders goal title and completion line regardless of toggles', () => {
    const { getByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: {
          ...DEFAULT_SHARE_CARD_STYLE,
          showBadge: false,
          showDate: false,
          showMomentum: false,
        },
      })
    );
    expect(getByText('Run a 5K')).toBeTruthy();
    expect(getByText("Done. That one's yours forever.")).toBeTruthy();
  });
});
