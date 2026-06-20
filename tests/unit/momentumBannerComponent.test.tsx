// tests/unit/momentumBannerComponent.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MomentumBanner } from '../../components/ui/MomentumBanner';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

describe('MomentumBanner', () => {
  it('renders the copy text', () => {
    const { getByText } = render(<MomentumBanner text="Some momentum is slipping." onDismiss={() => {}} />);
    expect(getByText('Some momentum is slipping.')).toBeTruthy();
  });

  it('calls onDismiss when the dismiss control is pressed', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<MomentumBanner text="x" onDismiss={onDismiss} />);
    fireEvent.press(getByTestId('momentum-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
