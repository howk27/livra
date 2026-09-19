// components/StoryShareControls.tsx
// The colour chips and Share, under the story card at the top of the Weekly
// Review (2026-09-18). Replaced StoryShareSheet.
//
// WHY THE SHEET WENT: it rendered through OverlayPortal (FullWindowOverlay on
// iOS), a layer that sits above every view controller, including ones
// presented AFTER it. expo-sharing presents the OS share sheet from the top
// presented controller (the review modal), so the share sheet opened
// UNDERNEATH our overlay: invisible, the awaited shareAsync never settled,
// and Share looked frozen on device. These controls live in the review
// screen's own view tree, the same place the pre-story share card shared
// from, so the OS sheet presents on top.
//
// The capture has a deadline so a stalled snapshot surfaces as the error
// line instead of a button that never comes back.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { STORY_PALETTES, STORY_PALETTE_IDS, type StoryPaletteId } from '../lib/sharing/storyPalettes';
import { generateShareCard } from '../lib/sharing/generateShareCard';
import { captureException } from '../lib/analytics/posthog';
import { useEffectiveTheme } from '../state/uiSlice';
import { fonts, fontSize, headerControl, radius, spacing, themedColors } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

export const STORY_SHARE_ERROR = "Couldn't make the card. Try again.";
export const STORY_CAPTURE_TIMEOUT_MS = 8000;

const EXPORT = { format: 'png' as const, width: 1080, height: 1920 };

export type StoryShareControlsProps = {
  cardRef: React.RefObject<View | null>;
  palette: StoryPaletteId;
  onPaletteChange: (id: StoryPaletteId) => void;
  /** False while the card is still animating in: the capture must be the settled frame. */
  ready: boolean;
  /** After the OS share sheet has been handed the file. Analytics lives in the caller. */
  onShared: () => void;
};

function withDeadline<T>(p: Promise<T>, ms: number, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`story share timed out at ${stage}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function StoryShareControls({ cardRef, palette, onPaletteChange, ready, onShared }: StoryShareControlsProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    let stage = 'capture';
    try {
      const uri = await withDeadline(
        generateShareCard(cardRef as React.RefObject<View>, EXPORT),
        STORY_CAPTURE_TIMEOUT_MS,
        stage,
      );
      // No deadline here: the OS sheet stays open as long as the person
      // browses it, and it only resolves when they finish.
      stage = 'share';
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your week' });
      onShared();
    } catch (e) {
      captureException(e, { surface: 'weekly_story_card', stage });
      setError(STORY_SHARE_ERROR);
    } finally {
      setBusy(false);
    }
  }, [busy, ready, cardRef, onShared]);

  const disabled = busy || !ready;

  return (
    <View testID="story-share-controls" style={styles.root}>
      <View style={styles.row}>
        <View style={styles.chips}>
          {STORY_PALETTE_IDS.map((id) => {
            const p = STORY_PALETTES[id];
            const selected = id === palette;
            return (
              <Pressable
                key={id}
                testID={`story-chip-${id}`}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                accessibilityState={{ selected }}
                onPress={() => onPaletteChange(id)}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: selected ? c.inkDark : applyOpacity(c.inkMuted, 0.4), opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: p.swatch }]} />
                <Text style={[styles.chipLabel, { color: c.inkDark }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          testID="story-share-button"
          accessibilityRole="button"
          accessibilityLabel="Share your week"
          accessibilityState={{ disabled, busy }}
          disabled={disabled}
          onPress={handleShare}
          style={({ pressed }) => [styles.share, { backgroundColor: c.forest, opacity: pressed || disabled ? 0.6 : 1 }]}
        >
          <Text style={[styles.shareLabel, { color: c.inkInverse }]}>{busy ? 'Making…' : 'Share'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text testID="story-share-error" style={[styles.error, { color: c.inkMid }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: headerControl.minTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  chipLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.base },
  share: {
    minHeight: headerControl.minTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: { fontFamily: fonts.sansSemibold, fontSize: fontSize.base },
  error: { fontFamily: fonts.sans, fontSize: fontSize.sm, marginTop: spacing.sm },
});
