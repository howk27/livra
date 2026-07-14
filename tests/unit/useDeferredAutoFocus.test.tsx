/**
 * VD-6 — useDeferredAutoFocus contract.
 *
 * The hook replaces `autoFocus` on TextInputs inside pageSheet modals: it must
 * focus exactly once, only after the presentation transition ends (or after
 * the fallback delay), never on closing transitions, and never when disabled.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import type { TextInput } from 'react-native';

type TransitionEndListener = (e: { data?: { closing?: boolean } }) => void;

const mockListeners: TransitionEndListener[] = [];
const mockRemoveListener = jest.fn();
const mockAddListener = jest.fn((type: string, cb: TransitionEndListener) => {
  if (type === 'transitionEnd') mockListeners.push(cb);
  return mockRemoveListener;
});

jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: mockAddListener }),
}));

import { useDeferredAutoFocus } from '../../hooks/useDeferredAutoFocus';

function attachInput(ref: React.RefObject<TextInput | null>) {
  const focus = jest.fn();
  (ref as React.MutableRefObject<TextInput | null>).current = {
    focus,
  } as unknown as TextInput;
  return focus;
}

function fireTransitionEnd(closing: boolean) {
  mockListeners.forEach(cb => cb({ data: { closing } }));
}

describe('useDeferredAutoFocus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockListeners.length = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not focus before the transition ends', () => {
    const { result } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses once the presentation transition ends', () => {
    const { result } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    act(() => fireTransitionEnd(false));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('ignores closing transitions', () => {
    const { result } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    act(() => fireTransitionEnd(true));
    expect(focus).not.toHaveBeenCalled();
  });

  it('falls back to a timer when transitionEnd never fires', () => {
    const { result } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    act(() => {
      jest.runAllTimers();
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses at most once (event then timer does not double-fire)', () => {
    const { result } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    act(() => fireTransitionEnd(false));
    act(() => {
      jest.runAllTimers();
    });
    act(() => fireTransitionEnd(false));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled, arms when enabled flips true', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDeferredAutoFocus(enabled),
      { initialProps: { enabled: false } },
    );
    const focus = attachInput(result.current);
    act(() => {
      jest.runAllTimers();
    });
    expect(focus).not.toHaveBeenCalled();

    rerender({ enabled: true });
    act(() => {
      jest.runAllTimers();
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('cleans up: no focus after unmount', () => {
    const { result, unmount } = renderHook(() => useDeferredAutoFocus());
    const focus = attachInput(result.current);
    unmount();
    act(() => {
      jest.runAllTimers();
    });
    expect(focus).not.toHaveBeenCalled();
    expect(mockRemoveListener).toHaveBeenCalled();
  });
});
