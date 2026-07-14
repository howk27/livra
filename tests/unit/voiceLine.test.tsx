// PL-4: VoiceLine component — renders only when the engine spoke, auto-dismisses,
// respects the app's single reduced-motion source, and only registers while focused.
import React from 'react';
import { act, render } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/markRow.test.tsx
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any) => v,
    withSequence: (v: any) => v,
    withSpring: (v: any) => v,
    withDelay: (_d: number, v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduced,
}));

// expo-router's useFocusEffect: run the effect on mount only while "focused",
// mirroring how the navigator invokes it for the visible screen.
let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      if (!mockFocused) return undefined;
      return effect();
    }, [effect]);
  },
}));

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

import { VoiceLine, VOICE_LINE_HOLD_MS } from '../../components/ui/VoiceLine';
import { useVoiceStore } from '../../state/voiceSlice';
import type { Moment } from '../../lib/moments/types';

const moment: Moment = {
  id: 'postLog.plain.0',
  surface: 'postLog',
  type: 'postLog',
  text: 'Logged. Small and real.',
};

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  mockFocused = true;
  useVoiceStore.setState({ line: null, surfaceCount: 0, lastMomentIds: {} });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('VoiceLine', () => {
  it('renders nothing while the store is silent (the majority case)', () => {
    const { queryByTestId } = render(<VoiceLine />);
    expect(queryByTestId('voice-line')).toBeNull();
  });

  it('renders the line text when the engine spoke, then auto-dismisses', () => {
    const { queryByTestId, getByText } = render(<VoiceLine />);
    act(() => useVoiceStore.getState().speak(moment));
    expect(getByText('Logged. Small and real.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(VOICE_LINE_HOLD_MS + 400);
    });
    expect(useVoiceStore.getState().line).toBeNull();
    expect(queryByTestId('voice-line')).toBeNull();
  });

  it('reduced motion: still appears statically and auto-dismisses', () => {
    mockReduced = true;
    const { queryByTestId, getByText } = render(<VoiceLine />);
    act(() => useVoiceStore.getState().speak(moment));
    expect(getByText('Logged. Small and real.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(VOICE_LINE_HOLD_MS + 1);
    });
    expect(queryByTestId('voice-line')).toBeNull();
  });

  it('registers as a surface only while focused', () => {
    const { unmount } = render(<VoiceLine />);
    expect(useVoiceStore.getState().surfaceCount).toBe(1);
    unmount();
    expect(useVoiceStore.getState().surfaceCount).toBe(0);
  });

  it('unfocused: does not register and does not render even when a line exists', () => {
    mockFocused = false;
    const { queryByTestId } = render(<VoiceLine />);
    expect(useVoiceStore.getState().surfaceCount).toBe(0);
    act(() => useVoiceStore.getState().speak(moment));
    expect(queryByTestId('voice-line')).toBeNull();
  });
});
