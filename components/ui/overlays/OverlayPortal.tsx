import React from 'react';
import { Modal, Platform } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';

interface OverlayPortalProps {
  visible: boolean;
  /** Android hardware back. Ignored on iOS, which has no equivalent gesture here. */
  onRequestClose: () => void;
  children: React.ReactNode;
}

/**
 * Renders root-mounted overlay content ABOVE every presented screen.
 *
 * WHY THIS EXISTS — the 1.0.58 "the app freezes when I delete a goal or a mark"
 * bug. ConfirmHost and ActionSheetHost are mounted as siblings of the navigator
 * (app/_layout.tsx), so a React Native <Modal> inside them presents from the
 * ROOT view controller: RCTModalHostViewManager.m does
 * `[[modalHostView reactViewController] presentViewController:…]`, and
 * reactViewController walks up to the nearest owning VC — the root, for anything
 * mounted outside the navigator.
 *
 * Whenever a `presentation: 'modal'` route is open — goal/[id], mark/[id],
 * goal/journal/[id], paywall — the root VC is ALREADY presenting that screen, and
 * UIKit refuses to present a second controller onto it. The card never appears,
 * the awaited `confirm()` never resolves so the delete never runs, and the
 * orphaned transparent controller lands on top once the screen dismisses, where
 * it swallows every touch. That is the freeze.
 *
 * The tell is the partition: every confirm() that worked was called from a TAB
 * (focus, settings — including sign-out); every one that froze was called from a
 * modal route. Dialogs rendered INSIDE those same modal screens work fine
 * (GoalLimitDialog on goal/new), because their nearest VC is the screen's own.
 * The variable is where the host is mounted, not the screen and not modals.
 *
 * FullWindowOverlay sidesteps view-controller presentation entirely — it renders
 * into its own UIWindow, above everything. iOS only, and only needed there: on
 * Android a <Modal> is a Dialog window, which already floats above presented
 * fragments, so the original mechanism is correct and is kept.
 */
export function OverlayPortal({ visible, onRequestClose, children }: OverlayPortalProps) {
  if (Platform.OS === 'ios') {
    // FullWindowOverlay has no `visible` prop — it is present whenever mounted.
    // Unmounting is visually identical to the old hide path, which collapsed the
    // exit to `timing(0, 0)`, i.e. instant.
    if (!visible) return null;
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {children}
      </FullWindowOverlay>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
