/**
 * useDeferredAutoFocus — VD-6, revised under QC2-D.
 *
 * Focuses a TextInput only after the native-stack presentation transition
 * settles, so the keyboard's appearance animation never overlaps the pageSheet
 * slide-in. VD-6 shipped this as the half-render FIX; QC2-D's re-diagnosis
 * showed the actual half-render root was KeyboardAvoidingView itself (now
 * removed from the creation modals — see app/goal/new.tsx), so this hook is
 * kept for presentation calm, not layout correctness.
 *
 * QC2-D also hardened the fallback: at 600ms it could fire BEFORE a real
 * `transitionEnd` (iOS pageSheet presentation ≈ 500ms plus JS-thread latency
 * from the chooser sheet's simultaneous close animation), re-creating the
 * exact mid-transition focus it exists to avoid. 900ms keeps the fallback
 * strictly a dead-event escape hatch (web, tests), never a competitor.
 *
 * Attach the returned ref to the TextInput and drop its `autoFocus` prop.
 */
import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';
import { useNavigation } from 'expo-router';

/** Fallback for navigators/platforms that never emit `transitionEnd` (web, tests).
 * Must comfortably exceed the iOS pageSheet presentation (~500ms) so it can
 * never fire mid-transition on a busy JS thread. */
const FALLBACK_DELAY_MS = 900;

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
