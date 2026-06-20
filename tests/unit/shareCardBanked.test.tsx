// tests/unit/shareCardBanked.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { GoalCompletionShareCard } from '../../components/GoalCompletionShareCard';

describe('GoalCompletionShareCard banked momentum', () => {
  const base = {
    goalTitle: 'Run a 5k',
    completedDate: '2026-06-20',
    levelTitle: 'Steady',
    daysTaken: 30,
  };

  it('renders the banked momentum line when days > 0', () => {
    const { getByText } = render(<GoalCompletionShareCard {...base} bankedMomentumDays={9} />);
    expect(getByText('Finished with 9 days of momentum')).toBeTruthy();
  });

  it('omits the line when bankedMomentumDays is 0 or missing', () => {
    const { queryByText } = render(<GoalCompletionShareCard {...base} bankedMomentumDays={0} />);
    expect(queryByText(/of momentum/)).toBeNull();
    const { queryByText: q2 } = render(<GoalCompletionShareCard {...base} />);
    expect(q2(/of momentum/)).toBeNull();
  });
});
