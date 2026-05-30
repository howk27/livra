import React from 'react';
import { render } from '@testing-library/react-native';
import { SharePreviewModal } from '../../components/SharePreviewModal';

jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'dark' }));

const baseProps = {
  visible: true,
  imageUri: null,
  goalTitle: 'Run a 5K',
  onClose: jest.fn(),
};

describe('SharePreviewModal', () => {
  it('renders when visible', () => {
    const { getByText } = render(<SharePreviewModal {...baseProps} />);
    expect(getByText('Run a 5K')).toBeTruthy();
  });

  it('shows Share and Save to Photos buttons', () => {
    const { getByText } = render(<SharePreviewModal {...baseProps} />);
    expect(getByText('Share')).toBeTruthy();
    expect(getByText('Save to Photos')).toBeTruthy();
  });

  it('shows ActivityIndicator when imageUri is null', () => {
    const { UNSAFE_queryByType } = render(<SharePreviewModal {...baseProps} />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
  });

  it('shows Image when imageUri is provided', () => {
    const { UNSAFE_queryByType } = render(
      <SharePreviewModal {...baseProps} imageUri="file:///tmp/card.jpg" />
    );
    const { Image } = require('react-native');
    expect(UNSAFE_queryByType(Image)).not.toBeNull();
  });
});
