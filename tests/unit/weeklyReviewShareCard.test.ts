import React from 'react';
import { render } from '@testing-library/react-native';
import { WeeklyReviewShareCard } from '../../components/WeeklyReviewShareCard';

// First-100 sprint (2026-09-04): the review-as-image card.
//
// PRIVACY PIN INVERTED 2026-09-06 (founder ruling, decisions.md). The card
// originally took no goal data at all and this suite pinned that absence. The
// founder blessed goal titles on the shareable image: the letter look is the
// asset, specificity is what makes it worth posting, and the OS share sheet
// previews the card before anything leaves the phone. So the pin now runs the
// other way — the title MUST render, because a card that silently dropped it
// would be the old design creeping back.

const goals = [
  {
    goalId: 'g1',
    title: 'Sleep like a person again',
    weeksIn: 3,
    marks: [
      { markId: 'm1', name: 'Lights out by 11', done: 5, target: 5, met: true },
      { markId: 'm2', name: 'No screens in bed', done: 3, target: 5, met: false },
      { markId: 'm3', name: 'Morning walk', done: 0, target: 3, met: false },
      { markId: 'm4', name: 'Overflow mark', done: 2, target: 3, met: false },
    ],
  },
];

const fullWeek = {
  weekLabel: 'Week of August 18',
  headline: 'A steady week.',
  prose: 'You showed up five days and the hard one held.',
  daysActive: [true, true, false, true, true, true, false],
  goals,
};

describe('WeeklyReviewShareCard', () => {
  it('renders the letter voice: week label, headline and prose', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Week of August 18')).toBeTruthy();
    expect(getByText('A steady week.')).toBeTruthy();
    expect(getByText('You showed up five days and the hard one held.')).toBeTruthy();
  });

  it('renders the goal title (the blessed change) and its week meta', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Sleep like a person again')).toBeTruthy();
    expect(getByText('week 3')).toBeTruthy();
  });

  it('renders mark lines in the letter’s own counting voice', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Lights out by 11')).toBeTruthy();
    expect(getByText('5 of 5  ✓')).toBeTruthy();
    expect(getByText('3 of 5')).toBeTruthy();
  });

  it('a zero is never rendered: an unstarted mark reads "not yet"', () => {
    const { getByText, queryByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('not yet')).toBeTruthy();
    expect(queryByText(/^0 of/)).toBeNull();
  });

  it('crops to three mark lines so the fixed 4:5 card cannot overflow', () => {
    const { queryByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(queryByText('Overflow mark')).toBeNull();
  });

  it('week one reads as prose, not as "week 0"', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, {
        ...fullWeek,
        goals: [{ ...goals[0], weeksIn: 0 }],
      }),
    );
    expect(getByText('week one')).toBeTruthy();
  });

  it('survives a week with no goal block at all', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, { ...fullWeek, goals: [] }),
    );
    expect(getByText('A steady week.')).toBeTruthy();
    expect(getByText('Livra')).toBeTruthy();
  });

  it('carries the wordmark and site', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Livra')).toBeTruthy();
    expect(getByText('livralife.com')).toBeTruthy();
  });
});
