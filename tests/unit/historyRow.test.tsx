// tests/unit/historyRow.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HistoryRow } from '../../components/goals/HistoryRow';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

describe('HistoryRow', () => {
  it('renders the History label and empty hint with zero completed goals', () => {
    const { getByText } = render(<HistoryRow completedCount={0} onPress={() => {}} />);
    expect(getByText('History')).toBeTruthy();
    expect(getByText('Nothing finished yet')).toBeTruthy();
  });

  it('shows the finished count when there are completed goals', () => {
    const { getByText } = render(<HistoryRow completedCount={3} onPress={() => {}} />);
    expect(getByText('3 finished')).toBeTruthy();
  });

  it('calls onPress when the row is tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<HistoryRow completedCount={0} onPress={onPress} />);
    fireEvent.press(getByTestId('history-row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
