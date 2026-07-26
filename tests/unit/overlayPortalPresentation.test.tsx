/**
 * Guards the fix for the 1.0.58 release blocker: deleting a goal or a mark froze
 * the app.
 *
 * ROOT CAUSE. ConfirmHost/ActionSheetHost are mounted as siblings of the
 * navigator, so a React Native <Modal> inside them presents from the ROOT view
 * controller (RCTModalHostViewManager.m:69 —
 * `[[modalHostView reactViewController] presentViewController:…]`). Whenever a
 * `presentation: 'modal'` route is open — goal/[id], mark/[id] — the root is
 * already presenting that screen, UIKit refuses the second presentation, the card
 * never appears, and the awaited confirm() never resolves, so the delete never
 * runs. Founder-confirmed on build 58: "No card appears. I just hit Delete and
 * when I back out of the mark detail screen it's frozen."
 *
 * WHAT THIS FILE CAN AND CANNOT DO. Jest has no UIKit, so it cannot reproduce the
 * failed presentation. What it CAN pin is the structural invariant that caused
 * it: on iOS these two root-mounted overlays must never present through an RN
 * <Modal>. Both assertions below fail if the <Modal> is put back.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Modal, Platform } from 'react-native';

// ── Native-module mocks (must precede the component imports) ─────────────────
// Deliberately NOT mocked: react-native's Modal and react-native-screens'
// FullWindowOverlay. Those two are the subject of every assertion here.
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

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
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
  };
});

import { FullWindowOverlay } from 'react-native-screens';
import { ConfirmDialog } from '../../components/ui/overlays/ConfirmDialog';
import { LivraActionSheet } from '../../components/ui/overlays/LivraActionSheet';

const confirmProps = {
  title: 'Delete mark?',
  message: 'This permanently deletes it.',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  destructive: true,
  onConfirm: () => {},
  onCancel: () => {},
};

const sheetProps = {
  title: 'Mark',
  actions: [{ label: 'Edit' }],
  cancelLabel: 'Cancel',
  onSelect: () => {},
  onCancel: () => {},
};

describe('root-mounted overlays present above modal routes', () => {
  it('the test suite runs as iOS, which is the platform the bug lives on', () => {
    // If this ever flips, the assertions below stop testing the broken path.
    expect(Platform.OS).toBe('ios');
  });

  it('ConfirmDialog does NOT present through an RN Modal', () => {
    const { UNSAFE_queryAllByType } = render(<ConfirmDialog visible {...confirmProps} />);
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    expect(UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(1);
  });

  it('LivraActionSheet does NOT present through an RN Modal', () => {
    const { UNSAFE_queryAllByType } = render(<LivraActionSheet visible {...sheetProps} />);
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
    expect(UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(1);
  });

  it('renders nothing at all when hidden, so no invisible layer can swallow touches', () => {
    const { UNSAFE_queryAllByType, queryByTestId } = render(
      <ConfirmDialog visible={false} {...confirmProps} />
    );
    expect(UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);
    expect(queryByTestId('confirm-dialog')).toBeNull();
  });

  it('still draws its card — the fix is a mount-point change, not a visual one', () => {
    const { getByTestId, getByText } = render(<ConfirmDialog visible {...confirmProps} />);
    expect(getByTestId('confirm-dialog')).toBeTruthy();
    expect(getByText('Delete mark?')).toBeTruthy();
    expect(getByText('This permanently deletes it.')).toBeTruthy();
  });
});
