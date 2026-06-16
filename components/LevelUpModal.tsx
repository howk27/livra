import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { themedColors } from '../theme/tokens';
import { spacing, fontSize, borderRadius } from '../theme/tokens';
import { LEVEL_UP_COPY, getBorderStyle } from '../lib/xpEngine';
import { useEffectiveTheme } from '../state/uiSlice';

interface LevelUpModalProps {
  level: number;
  levelTitle: string;
  onDismiss: () => void;
}

export function LevelUpModal({ level, levelTitle, onDismiss }: LevelUpModalProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  const borderStyle = getBorderStyle(level);
  const scale = useSharedValue(0.85);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 120 });

    if (borderStyle.animated) {
      pulseScale.value = withRepeat(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const copy = LEVEL_UP_COPY[level] ?? 'Keep going.';

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.card, { backgroundColor: c.surface }, containerStyle]}>
        <Text style={[styles.levelNumber, { color: c.accent }]}>Level {level}</Text>

        <Animated.View
          style={[
            styles.emblem,
            {
              borderWidth: borderStyle.borderWidth,
              borderColor: borderStyle.borderColor,
            },
            borderStyle.doubleRing && {
              shadowColor: borderStyle.borderColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.4,
              shadowRadius: 6,
              elevation: 6,
            },
            borderStyle.shadowElevation != null && {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: borderStyle.shadowElevation,
              elevation: borderStyle.shadowElevation,
            },
            borderStyle.animated && pulseStyle,
          ]}
        >
          <Text style={[styles.emblemText, { color: c.accent }]}>{level}</Text>
        </Animated.View>

        <Text style={[styles.title, { color: c.inkDark }]}>{levelTitle}</Text>
        <Text style={[styles.copy, { color: c.inkMid }]}>{copy}</Text>

        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.forest, opacity: pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Keep going"
        >
          <Text style={styles.ctaText}>Keep going</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    width: '82%',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  levelNumber: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  emblem: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  emblemText: {
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  copy: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.full,
  },
  ctaText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
