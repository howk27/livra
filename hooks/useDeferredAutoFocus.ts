/**
 * useDeferredAutoFocus — VD-6 (new-goal half-render fix).
 *
 * `autoFocus` on a TextInput inside a native pageSheet modal makes the
 * keyboard's appearance animation race the sheet's presentation transition.
 * RN's KeyboardAvoidingView computes its padding from the frame it holds when
 * `keyboardWillShow` lands and only recomputes when the frame HEIGHT changes
 * (react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:136),
 * so a measurement taken mid-transition leaves a stale, screen-scale
 * paddingBottom behind — the content sits squashed in the top half of the
 * sheet ("renders halfway only"). Focusing only after the transition settles
 * removes the race at its root instead of patching the padding.
 *
 * Attach the returned ref to the TextInput and drop its `autoFocus` prop.
 */
import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';
import { useNavigation } from 'expo-router';

/** Fallback for navigators/platforms that never emit `transitionEnd` (web, tests). */
const FALLBACK_DELAY_MS = 600;

type TransitionEndListener = (e: { data?: { closing?: boolean } }) => void;
type NavigationLike = {
  addListener?: (type: 'transitionEnd', cb: TransitionEndListener) => () => void;
};

export function useDeferredAutoFocus(enabled: boolean = true) {
  const ref = useRef<TextInput>(null);
  const navigation = useNavigation();

  useEffect(() => {
    if (!enabled) return;
    let settled = false;
    const focusOnce = () => {
      if (settled) return;
      settled = true;
      ref.current?.focus();
    };

    // Native-stack emits `transitionEnd` when the modal finishes presenting.
    // The event name isn't in the base NavigationProp union, hence the cast.
    const unsubscribe = (navigation as NavigationLike).addListener?.(
      'transitionEnd',
      (e) => {
        if (!e?.data?.closing) focusOnce();
      },
    );
    const timer = setTimeout(focusOnce, FALLBACK_DELAY_MS);

    return () => {
      settled = true;
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [enabled, navigation]);

  return ref;
}
