import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SharePreviewModal } from '../../components/SharePreviewModal';
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

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
jest.mock('../../components/GoalCompletionShareCard', () => ({
  GoalCompletionShareCard: () => null,
}));

const baseProps = {
  visible: true,
  goalTitle: 'Run a 5K',
  style: DEFAULT_SHARE_CARD_STYLE,
  onStyleChange: jest.fn(),
  onRequestUpgrade: jest.fn(),
  onShare: jest.fn(),
  onSave: jest.fn(),
  onClose: jest.fn(),
  saveLabel: 'Save to Photos',
  cardProps: {
    goalTitle: 'Run a 5K',
    completedDate: '2026-05-29',
    levelTitle: 'Focused',
    daysTaken: 42,
  },
  forwardRef: React.createRef(),
};

describe('SharePreviewModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('free users see the locked customize nudge, not the controls', () => {
    const { getByText, queryByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} />
    );
    expect(getByText('Customize · Livra+')).toBeTruthy();
    expect(queryByText('Forest')).toBeNull(); // theme swatch label not shown to free
  });

  it('tapping the locked nudge requests upgrade', () => {
    const onRequestUpgrade = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} onRequestUpgrade={onRequestUpgrade} />
    );
    fireEvent.press(getByText('Customize · Livra+'));
    expect(onRequestUpgrade).toHaveBeenCalledTimes(1);
  });

  it('Pro users see theme controls and can change style', () => {
    const onStyleChange = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize onStyleChange={onStyleChange} />
    );
    fireEvent.press(getByText('Night'));
    expect(onStyleChange).toHaveBeenCalledWith({ themeId: 'night' });
  });

  it('Share and Save work in both tiers', () => {
    const onShare = jest.fn();
    const onSave = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} onShare={onShare} onSave={onSave} />
    );
    fireEvent.press(getByText('Share'));
    fireEvent.press(getByText('Save to Photos'));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
