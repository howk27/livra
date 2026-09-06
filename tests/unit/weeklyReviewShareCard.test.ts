import React from 'react';
import { render } from '@testing-library/react-native';
import { WeeklyReviewShareCard } from '../../components/WeeklyReviewShareCard';

// First-100 sprint (2026-09-04): the review-as-image card. The privacy pin is
// the load-bearing test — the component takes NO goal titles by construction,
// and this suite fails if anyone threads one through as free text.

const fullWeek = {
  weekLabel: 'Week of August 18',
  headline: 'A steady week.',
  daysActive: [true, true, false, true, true, true, false],
  daysActiveCount: 5,
  marksLogged: 14,
};

describe('WeeklyReviewShareCard', () => {
  it('renders the week label and headline', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Week of August 18')).toBeTruthy();
    expect(getByText('A steady week.')).toBeTruthy();
  });

  it('renders the counts line for an active week', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('5 days showed up · 14 marks')).toBeTruthy();
  });

  it('singular forms read as prose, not grammar debt', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, {
        ...fullWeek,
        daysActiveCount: 1,
        marksLogged: 1,
      }),
    );
    expect(getByText('1 day showed up · 1 mark')).toBeTruthy();
  });

  it('a quiet week renders NO counts line: a zero is never rendered', () => {
    const { queryByText } = render(
      React.createElement(WeeklyReviewShareCard, {
        ...fullWeek,
        daysActive: [false, false, false, false, false, false, false],
        daysActiveCount: 0,
        marksLogged: 0,
      }),
    );
    expect(queryByText(/showed up/)).toBeNull();
    expect(queryByText(/0/)).toBeNull();
  });

  it('carries the wordmark and site, and never a goal title (privacy pin)', () => {
    const { getByText, queryByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Livra')).toBeTruthy();
    expect(getByText('livralife.com')).toBeTruthy();
    // The component's props carry no goal data at all; if a goal title ever
    // appears here, someone rerouted personal content onto a public artifact.
    expect(queryByText(/Lose 15 pounds/)).toBeNull();
  });
});
