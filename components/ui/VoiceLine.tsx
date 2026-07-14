// PL-4 (M5): the post-log voice line — Livra speaking after a check-in.
// Rendering decision: a screen-level overlay, not a NotificationContext toast
// and not an in-row line. Absolutely positioned + pointerEvents none, so it can
// never shift neighboring rows (Focus rows are swipeable), never blocks a tap,
// and never fights the row check animation or the day-complete pulse (it lives
// in a different screen region). Serif italic ink on a quiet surface pill with
// an ember tint: VD-1 sanctions ember for warm status lines, and keeping ember
// as border tint (text stays inkDark) respects the 2.37:1 light-mode limit.
// Motion: opacity + translateY only; auto-dismiss ~3s; reduced motion collapses
// to static appear/disappear via useMotion (the app's single reduced source).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { fonts, fontSize, motion, radius, shadow, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { useVoiceStore } from '../../state/voiceSlice';
import { applyOpacity } from '../../src/components/icons/color';

/** Hold before fade-out — inside the sanctioned 2.5–3.5s window. */
export const VOICE_LINE_HOLD_MS = 3000;

type Props = {
  /** Distance from the screen bottom; callers clear their own FABs/bars. */
  bottomOffset?: number;
};

export function VoiceLine({ bottomOffset = spacing.xxl }: Props) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced, timing, spring } = useMotion();
  const line = useVoiceStore((s) => s.line);
  const [focused, setFocused] = useState(false);

  // Register as a rendering surface only while focused: the engine stays
  // silent (and voice_line_shown stays truthful) when no surface can show it.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      const release = useVoiceStore.getState().registerSurface();
      return () => {
        setFocused(false);
        release();
      };
    }, []),
  );

  const opacity = useSharedValue(0);
  const rise = useSharedValue(6);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineKey = line?.key ?? null;
  useEffect(() => {
    if (lineKey == null) return;
    // Entrance: fade + a small rise. Under Reduce Motion both collapse to
    // an instant appear (useMotion zeroes the durations).
    opacity.value = 0;
    rise.value = 6;
    opacity.value = timing(1, motion.relaxed);
    rise.value = spring(0, 'settle');

    hideTimer.current = setTimeout(() => {
      opacity.value = timing(0, motion.gentle);
      clearTimer.current = setTimeout(
        () => useVoiceStore.getState().clearLine(),
        reduced ? 0 : motion.gentle,
      );
    }, VOICE_LINE_HOLD_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: rise.value }],
  }));

  if (!line || !focused) return null;

  return (
    <Animated.View
      testID="voice-line"
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { bottom: bottomOffset }, animatedStyle]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: c.surface,
            borderColor: applyOpacity(c.ember, 0.45),
          },
        ]}
      >
        <Text style={[styles.text, { color: c.inkDark }]} numberOfLines={2}>
          {line.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
    ...shadow.card,
  },
  text: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 21,
    textAlign: 'center',
  },
});
