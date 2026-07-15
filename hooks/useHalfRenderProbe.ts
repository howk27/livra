/**
 * useHalfRenderProbe — QC2-D diagnostic (dev builds only).
 *
 * The goal-creation pageSheet modals shipped a device-only "renders halfway"
 * bug twice (VD-6, QC2-D). The QC2-D fix removes KeyboardAvoidingView — the
 * only stateful layout in that flow — so the JS-side failure class is gone.
 * If a half-render EVER reproduces again, the remaining suspect is native
 * (react-native-screens measuring the sheet against a keyboard-shrunk window).
 * This probe settles that question with one Metro line: attach the returned
 * callback to the screen's root container `onLayout` and read whether the
 * CONTAINER itself is short (native measurement — escalate/upgrade
 * react-native-screens) or full height (the problem is inside the content).
 *
 * No-op outside __DEV__; costs one stable callback in production.
 */
import { useCallback } from 'react';
import { Dimensions, type LayoutChangeEvent } from 'react-native';

/** A pageSheet container should be ≈ window height minus the sheet's top
 * offset (~6–8%). Anything under 75% of the window means the container itself
 * was mis-measured. */
const SHORT_CONTAINER_RATIO = 0.75;

export function useHalfRenderProbe(tag: string) {
  return useCallback(
    (e: LayoutChangeEvent) => {
      if (!__DEV__) return;
      const { height } = e.nativeEvent.layout;
      const windowHeight = Dimensions.get('window').height;
      const short = height < windowHeight * SHORT_CONTAINER_RATIO;
      // eslint-disable-next-line no-console
      console.log(
        `[half-render-probe] ${tag}: container ${Math.round(height)}pt / window ${Math.round(windowHeight)}pt` +
          (short ? ' — CONTAINER SHORT: native sheet measurement, not content' : ''),
      );
    },
    [tag],
  );
}
