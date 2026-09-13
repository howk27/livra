import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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
//
// CROP PIN INVERTED 2026-09-13 (founder ruling, decisions.md). The card was
// pinned to 340x425pt and this suite pinned the cropping that made it fit —
// three mark lines, one goal. Device QA found the result truncated (the
// quiet-week prose cut mid-sentence) AND clumped (~190px of dead linen above
// the footer). The ratio is gone; height follows the content. These tests now
// pin the OPPOSITE: nothing is cut to fit, and the two structural causes of
// the clumping — a fixed height and numberOfLines caps — must stay gone.

const marks = [
  { markId: 'm1', name: 'Lights out by 11', done: 5, target: 5, met: true },
  { markId: 'm2', name: 'No screens in bed', done: 3, target: 5, met: false },
  { markId: 'm3', name: 'Morning walk', done: 0, target: 3, met: false },
  { markId: 'm4', name: 'Fourth mark', done: 2, target: 3, met: false },
];

const goals = [
  { goalId: 'g1', title: 'Sleep like a person again', weeksIn: 3, marks },
  {
    goalId: 'g2',
    title: 'Learn a new skill',
    weeksIn: 4,
    marks: [{ markId: 'm5', name: 'Study', done: 0, target: 4, met: false }],
  },
  {
    goalId: 'g3',
    title: 'Third goal past the cap',
    weeksIn: 1,
    marks: [{ markId: 'm6', name: 'Never rendered', done: 1, target: 2, met: false }],
  },
];

// The real quiet-week string from lib/weeklyReview/derive.ts — the one device
// QA caught being cut at "...The thread...".
const LONG_PROSE =
  'No marks landed this week, and that is simply where the week went. The thread is still yours, and Monday is a clean page.';

const fullWeek = {
  weekLabel: 'Week of August 18',
  headline: 'A steady week.',
  prose: 'You showed up five days and the hard one held.',
  daysActive: [true, true, false, true, true, true, false],
  goals: goals.slice(0, 1),
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

  // ── The 2026-09-13 rulings ────────────────────────────────────────────────

  it('carries a second goal block, and stops at two', () => {
    const { getByText, queryByText } = render(
      React.createElement(WeeklyReviewShareCard, { ...fullWeek, goals }),
    );
    expect(getByText('Sleep like a person again')).toBeTruthy();
    expect(getByText('Learn a new skill')).toBeTruthy();
    expect(queryByText('Third goal past the cap')).toBeNull();
    expect(queryByText('Never rendered')).toBeNull();
  });

  it('no longer crops mark lines: every mark on a shown goal renders', () => {
    const { getByText } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    expect(getByText('Fourth mark')).toBeTruthy();
  });

  it('the long quiet-week prose is never truncated', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, { ...fullWeek, prose: LONG_PROSE }),
    );
    // Present in full, and with no line cap to cut it — numberOfLines on this
    // line is exactly what device QA caught cutting it at "...The thread...".
    expect(getByText(LONG_PROSE).props.numberOfLines).toBeUndefined();
  });

  it('no line on the card is capped, so nothing is cut to fit', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, { ...fullWeek, goals }),
    );
    for (const line of [
      'A steady week.',
      'Sleep like a person again',
      'Lights out by 11',
      'Learn a new skill',
    ]) {
      expect(getByText(line).props.numberOfLines).toBeUndefined();
    }
  });

  it('the card has no fixed height and no leftover space to distribute', () => {
    const { toJSON } = render(React.createElement(WeeklyReviewShareCard, fullWeek));
    const root = toJSON() as { props: { style: unknown } };
    const style = StyleSheet.flatten(root.props.style) as {
      height?: number;
      justifyContent?: string;
      width?: number;
    };
    // A height plus space-between is what dumped every bit of slack into one
    // hole above the footer. Both must stay gone.
    expect(style.height).toBeUndefined();
    expect(style.justifyContent).toBeUndefined();
    // Width stays fixed so the exported image has a predictable size.
    expect(style.width).toBe(340);
  });

  it('nothing on the card scales with the device text size', () => {
    const { getByText } = render(
      React.createElement(WeeklyReviewShareCard, { ...fullWeek, goals }),
    );
    for (const line of [
      'Week of August 18',
      'A steady week.',
      'Sleep like a person again',
      'week 3',
      'Lights out by 11',
      'Livra',
      'livralife.com',
    ]) {
      expect(getByText(line).props.allowFontScaling).toBe(false);
    }
  });
});
