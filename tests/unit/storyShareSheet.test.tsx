import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { generateShareCard } from '../../lib/sharing/generateShareCard';
import { captureException } from '../../lib/analytics/posthog';
import { STORY_SHARE_ERROR, StoryShareSheet } from '../../components/StoryShareSheet';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../components/ui/overlays/OverlayPortal', () => ({
  OverlayPortal: ({ visible, children }: any) => (visible ? children : null),
}));
jest.mock('../../lib/sharing/generateShareCard', () => ({
  generateShareCard: jest.fn().mockResolvedValue('file:///tmp/story.png'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/analytics/posthog', () => ({
  capture: jest.fn(),
  captureException: jest.fn(),
}));

const card = {
  weekLabel: 'Week of September 8',
  archetype: { id: 'slow_burn' as const, name: 'The Slow Burn', line: 'Not loud. Not gone. Still going.' },
  daysActive: [true, true, false, true, true, false, true],
  daysActiveCount: 5,
  marksLogged: 11,
  goalTitles: ['Marathon Prep'],
};

const props = () => ({
  visible: true,
  card,
  palette: 'amber' as const,
  onPaletteChange: jest.fn(),
  onShared: jest.fn(),
  onClose: jest.fn(),
});

describe('StoryShareSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when hidden, the card and both chips when visible', () => {
    const p = props();
    const { queryByTestId, rerender, getByTestId, getByText } = render(
      <StoryShareSheet {...p} visible={false} />,
    );
    expect(queryByTestId('story-share-sheet')).toBeNull();
    rerender(<StoryShareSheet {...p} />);
    expect(getByTestId('story-card')).toBeTruthy();
    expect(getByText('Amber')).toBeTruthy();
    expect(getByText('Green')).toBeTruthy();
    expect(getByText('The Slow Burn')).toBeTruthy();
  });

  it('a chip tap reports the palette; the selected chip is marked', () => {
    const p = props();
    const { getByTestId } = render(<StoryShareSheet {...p} />);
    fireEvent.press(getByTestId('story-chip-green'));
    expect(p.onPaletteChange).toHaveBeenCalledWith('green');
    expect(getByTestId('story-chip-amber').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('story-chip-green').props.accessibilityState).toEqual({ selected: false });
  });

  it('Share captures 1080x1920 png, hands it to the OS sheet, then reports', async () => {
    const p = props();
    const { getByTestId } = render(<StoryShareSheet {...p} />);
    await act(async () => {
      fireEvent.press(getByTestId('story-share-button'));
    });
    await waitFor(() => expect(p.onShared).toHaveBeenCalledTimes(1));
    expect(generateShareCard).toHaveBeenCalledWith(expect.anything(), {
      format: 'png',
      width: 1080,
      height: 1920,
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/story.png', {
      mimeType: 'image/png',
      dialogTitle: 'Share your week',
    });
  });

  it('a capture failure keeps the sheet open, shows one line, reports the exception', async () => {
    (generateShareCard as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const p = props();
    const { getByTestId, getByText } = render(<StoryShareSheet {...p} />);
    await act(async () => {
      fireEvent.press(getByTestId('story-share-button'));
    });
    await waitFor(() => expect(getByText(STORY_SHARE_ERROR)).toBeTruthy());
    expect(p.onShared).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { surface: 'weekly_story_card' });
  });

  it('Not now closes', () => {
    const p = props();
    const { getByText } = render(<StoryShareSheet {...p} />);
    fireEvent.press(getByText('Not now'));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
