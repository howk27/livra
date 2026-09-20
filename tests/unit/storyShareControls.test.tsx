// The share controls under the story card on the Weekly Review (2026-09-18).
// Replaced the StoryShareSheet suite: the sheet rendered through
// FullWindowOverlay, so the OS share sheet opened UNDER it and Share froze.
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { processColor } from 'react-native';
import * as Sharing from 'expo-sharing';
import { generateShareCard } from '../../lib/sharing/generateShareCard';
import { captureException } from '../../lib/analytics/posthog';
import { STORY_PALETTES } from '../../lib/sharing/storyPalettes';
import {
  STORY_CAPTURE_TIMEOUT_MS,
  STORY_SHARE_ERROR,
  StoryShareControls,
} from '../../components/StoryShareControls';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../lib/sharing/generateShareCard', () => ({
  generateShareCard: jest.fn().mockResolvedValue('file:///tmp/story.png'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/analytics/posthog', () => ({
  capture: jest.fn(),
  captureException: jest.fn(),
}));

const props = () => ({
  cardRef: { current: null },
  palette: 'amber' as const,
  onPaletteChange: jest.fn(),
  prefs: { showName: true, showWeeksIn: true, showGoalTitle: true },
  onPrefChange: jest.fn(),
  canSign: true,
  ready: true,
  onShared: jest.fn(),
});

describe('StoryShareControls', () => {
  beforeEach(() => jest.clearAllMocks());

  it('each chip previews the gradient it chooses, not a flat colour', () => {
    const { getByTestId } = render(<StoryShareControls {...props()} />);
    // LinearGradient hands colours down already processed, so compare in the
    // same currency rather than against the hex we wrote.
    const asColours = (id: 'amber' | 'green') =>
      [STORY_PALETTES[id].tint, STORY_PALETTES[id].tintEnd].map((hex) => processColor(hex));
    expect(getByTestId('story-swatch-amber').props.colors).toEqual(asColours('amber'));
    expect(getByTestId('story-swatch-green').props.colors).toEqual(asColours('green'));
  });

  it('a chip tap reports the palette; the selected chip is marked', () => {
    const p = props();
    const { getByTestId } = render(<StoryShareControls {...p} />);
    fireEvent.press(getByTestId('story-chip-green'));
    expect(p.onPaletteChange).toHaveBeenCalledWith('green');
    expect(getByTestId('story-chip-amber').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('story-chip-green').props.accessibilityState).toEqual({ selected: false });
  });

  it('Share captures 1080x1920 png, hands it to the OS sheet, then reports', async () => {
    const p = props();
    const { getByTestId } = render(<StoryShareControls {...p} />);
    await act(async () => {
      fireEvent.press(getByTestId('story-share-button'));
    });
    await waitFor(() => expect(p.onShared).toHaveBeenCalledTimes(1));
    expect(generateShareCard).toHaveBeenCalledWith(p.cardRef, { format: 'png', width: 1080, height: 1920 });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/story.png', {
      mimeType: 'image/png',
      dialogTitle: 'Share your week',
    });
  });

  it('holds Share while the card is still animating in (never captures a half-counted week)', async () => {
    const p = { ...props(), ready: false };
    const { getByTestId } = render(<StoryShareControls {...p} />);
    await act(async () => {
      fireEvent.press(getByTestId('story-share-button'));
    });
    expect(generateShareCard).not.toHaveBeenCalled();
  });

  it('a capture failure shows one line and reports the exception with its stage', async () => {
    (generateShareCard as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const p = props();
    const { getByTestId, getByText } = render(<StoryShareControls {...p} />);
    await act(async () => {
      fireEvent.press(getByTestId('story-share-button'));
    });
    await waitFor(() => expect(getByText(STORY_SHARE_ERROR)).toBeTruthy());
    expect(p.onShared).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      surface: 'weekly_story_card',
      stage: 'capture',
    });
  });

  it('a capture that never settles times out into the error line, never a frozen button', async () => {
    jest.useFakeTimers();
    try {
      (generateShareCard as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
      const p = props();
      const { getByTestId, getByText } = render(<StoryShareControls {...p} />);
      await act(async () => {
        fireEvent.press(getByTestId('story-share-button'));
      });
      await act(async () => {
        jest.advanceTimersByTime(STORY_CAPTURE_TIMEOUT_MS + 1);
      });
      expect(getByText(STORY_SHARE_ERROR)).toBeTruthy();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(getByTestId('story-share-button').props.accessibilityState).toEqual({ disabled: false, busy: false });
    } finally {
      jest.useRealTimers();
    }
  });
  // Personalization (spec 2026-09-20): the toggles only ever SUBTRACT from a
  // card that ships complete, so one-tap sharing survives.
  describe('personalize toggles', () => {
    // Founder 2026-09-20: these are I/O switches, not pills — the control
    // should look like what it does.
    it('offers one labelled switch per element, all on', () => {
      const { getByTestId, getByText } = render(<StoryShareControls {...props()} />);
      for (const key of ['showName', 'showWeeksIn', 'showGoalTitle']) {
        expect(getByTestId(`story-toggle-${key}`).props.value).toBe(true);
      }
      expect(getByText('Name')).toBeTruthy();
      expect(getByText('Week count')).toBeTruthy();
      expect(getByText('Goal name')).toBeTruthy();
    });

    it('flipping a switch off reports it', () => {
      const p = props();
      const { getByTestId } = render(<StoryShareControls {...p} />);
      fireEvent(getByTestId('story-toggle-showGoalTitle'), 'valueChange', false);
      expect(p.onPrefChange).toHaveBeenCalledWith('showGoalTitle', false);
    });

    it('an off switch renders off, and flipping it back reports on', () => {
      const p = { ...props(), prefs: { showName: true, showWeeksIn: true, showGoalTitle: false } };
      const { getByTestId } = render(<StoryShareControls {...p} />);
      const sw = getByTestId('story-toggle-showGoalTitle');
      expect(sw.props.value).toBe(false);
      fireEvent(sw, 'valueChange', true);
      expect(p.onPrefChange).toHaveBeenCalledWith('showGoalTitle', true);
    });

    it('a name-less account is never offered the Name switch', () => {
      const p = { ...props(), canSign: false };
      const { queryByTestId, getByTestId } = render(<StoryShareControls {...p} />);
      expect(queryByTestId('story-toggle-showName')).toBeNull();
      expect(getByTestId('story-toggle-showWeeksIn')).toBeTruthy();
    });
  });
});
