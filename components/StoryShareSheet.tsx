// components/StoryShareSheet.tsx
// The one step between "Export" on the Weekly Review and the OS share sheet
// (spec 2026-09-15 §6-8): a live preview of the story card, two colour chips,
// Share. Not a customizer; the ownership moment is one tap.
//
// Presented through OverlayPortal, never a bare <Modal>: app/review is a
// presentation:'modal' route and a root-presented Modal cannot show over it
// (see components/ui/overlays/OverlayPortal.tsx for the 1.0.58 freeze).
//
// The preview IS the capture host. The card is laid out at its true 360x640
// and only the wrapper is scaled, so captureRef (which snapshots the card's
// own layer at its own bounds) exports full size. A card that is always
// smaller than the window also retires the 2026-09-13 open risk about
// capturing a view taller than the screen.
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Sharing from 'expo-sharing';
import { OverlayPortal } from './ui/overlays/OverlayPortal';
import { WeeklyStoryCard, STORY_CARD_HEIGHT, STORY_CARD_WIDTH, type WeeklyStoryCardProps } from './WeeklyStoryCard';
import { STORY_PALETTES, STORY_PALETTE_IDS, type StoryPaletteId } from '../lib/sharing/storyPalettes';
import { generateShareCard } from '../lib/sharing/generateShareCard';
import { captureException } from '../lib/analytics/posthog';
import { useEffectiveTheme } from '../state/uiSlice';
import { fonts, fontSize, radius, shadow, spacing, themedColors } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

export const STORY_SHARE_ERROR = "Couldn't make the card. Try again.";

const EXPORT = { format: 'png' as const, width: 1080, height: 1920 };

export type StoryShareSheetProps = {
  visible: boolean;
  card: Omit<WeeklyStoryCardProps, 'palette'>;
  palette: StoryPaletteId;
  onPaletteChange: (id: StoryPaletteId) => void;
  /** After the OS share sheet has been handed the file. Analytics lives in the caller. */
  onShared: () => void;
  onClose: () => void;
};

export function StoryShareSheet({ visible, card, palette, onPaletteChange, onShared, onClose }: StoryShareSheetProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { height: windowHeight } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview at 0.55, smaller on short windows so chips and button always fit.
  const scale = Math.min(0.55, (windowHeight * 0.48) / STORY_CARD_HEIGHT);
  const previewW = Math.round(STORY_CARD_WIDTH * scale);
  const previewH = Math.round(STORY_CARD_HEIGHT * scale);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const uri = await generateShareCard(cardRef as React.RefObject<View>, EXPORT);
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your week' });
      onShared();
    } catch (e) {
      captureException(e, { surface: 'weekly_story_card' });
      setError(STORY_SHARE_ERROR);
    } finally {
      setBusy(false);
    }
  }, [busy, onShared]);

  return (
    <OverlayPortal visible={visible} onRequestClose={onClose}>
      <View style={styles.root} testID="story-share-sheet">
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={[styles.previewBox, { width: previewW, height: previewH }]}>
            <View
              style={[
                styles.previewScale,
                {
                  width: STORY_CARD_WIDTH,
                  height: STORY_CARD_HEIGHT,
                  transform: [
                    { translateX: -(STORY_CARD_WIDTH - previewW) / 2 },
                    { translateY: -(STORY_CARD_HEIGHT - previewH) / 2 },
                    { scale },
                  ],
                },
                shadow.card,
              ]}
            >
              <WeeklyStoryCard ref={cardRef} {...card} palette={STORY_PALETTES[palette]} />
            </View>
          </View>

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
            accessibilityLabel="Share"
            disabled={busy}
            onPress={handleShare}
            style={({ pressed }) => [styles.share, { backgroundColor: c.forest, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.shareLabel, { color: c.linen }]}>Share</Text>
          </Pressable>

          {error ? (
            <Text testID="story-share-error" style={[styles.error, { color: c.inkMid }]}>
              {error}
            </Text>
          ) : null}

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.notNow}>
            <Text style={[styles.notNowLabel, { color: c.inkMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  // The box is the SCALED size; the child is laid out at full size and
  // transformed into it. Centre-origin scale pulled back to the top-left via
  // translate (transformOrigin not used: see the type-check note below).
  previewBox: { overflow: 'visible' },
  previewScale: { borderRadius: radius.md, overflow: 'hidden' },
  chips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  chipLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.base },
  share: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  shareLabel: { fontFamily: fonts.sansSemibold, fontSize: fontSize.lg },
  error: { fontFamily: fonts.sans, fontSize: fontSize.sm, marginTop: spacing.sm },
  notNow: { marginTop: spacing.md, paddingVertical: spacing.xs },
  notNowLabel: { fontFamily: fonts.sans, fontSize: fontSize.base },
});
