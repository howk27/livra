import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontWeight, fontSize } from '../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Coerce props to integers. Rejects booleans (avoids `Math.max(1, true) === 1`) and accepts numeric strings.
 */
function parsePositiveInt(value: unknown): number {
  if (typeof value === 'boolean') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

/** Light sage start → fresh green → honey → soft orange (completion); progress-sampled per tile. */
const MOMENTUM_ANCHORS_LIGHT = ['#C8D6AA', '#92C49A', '#5FAF7E', '#C6A24E', '#E8945C'] as const;
const MOMENTUM_ANCHORS_DARK = ['#7A8F6E', '#5A9072', '#4A9B7A', '#B89248', '#DC9658'] as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function lerpHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(A.r + (B.r - A.r) * u);
  const g = Math.round(A.g + (B.g - A.g) * u);
  const bl = Math.round(A.b + (B.b - A.b) * u);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Sample along the anchor polyline; t=0 is start, t=1 is completion orange. */
function colorAtProgress(t: number, anchors: readonly string[]): string {
  const n = anchors.length;
  if (n === 0) return '#000000';
  if (n === 1) return anchors[0];
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const f = x - i;
  return lerpHex(anchors[i], anchors[i + 1], f);
}

/**
 * Each filled tile spans a slice of the full ramp so the last filled segment always reaches orange,
 * even when only 1–2 marks exist (previously early indices never left dark/mid green).
 */
function filledSegmentGradientColors(
  segmentIndex: number,
  isDark: boolean,
  filledCount: number,
): readonly [string, string] {
  const anchors = isDark ? MOMENTUM_ANCHORS_DARK : MOMENTUM_ANCHORS_LIGHT;
  if (filledCount <= 0) return [anchors[0], anchors[1]];
  const t0 = segmentIndex / filledCount;
  const t1 = (segmentIndex + 1) / filledCount;
  return [colorAtProgress(t0, anchors), colorAtProgress(t1, anchors)];
}

interface DailyProgressCardProps {
  completedToday: number;
  totalMarks: number;
  /** Kept for backward-compat; not rendered in new design */
  flat?: boolean;
  /** Contextual message shown below the tiles */
  directionalMessage?: string | null;
  /** Overall consecutive-day streak */
  streakDays?: number;
  /** Increment when streak grows to play a subtle label animation */
  streakPulseToken?: number;
  /** All marks completed for the day */
  allMarksComplete?: boolean;
  /** Brief highlight after first time closing the full set (feature discovery) */
  momentumHighlight?: boolean;
}

export const DailyProgressCard: React.FC<DailyProgressCardProps> = ({
  completedToday,
  totalMarks,
  directionalMessage,
  streakDays = 0,
  streakPulseToken = 0,
  allMarksComplete = false,
  momentumHighlight = false,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  const safeTotal = parsePositiveInt(totalMarks);
  const safeCompleted = Math.min(parsePositiveInt(completedToday), safeTotal);

  if (safeTotal <= 0) {
    return null;
  }

  const tileUnits = safeTotal;
  const filledTiles = safeCompleted;

  const TILE_HEIGHT = 12;

  const isAllDone =
    (allMarksComplete && safeTotal > 0) || (safeCompleted >= safeTotal && safeTotal > 0);

  const subText =
    directionalMessage ??
    (isAllDone ? 'Day complete' : null);

  const streakScale = useRef(new Animated.Value(1)).current;
  const completionScale = useRef(new Animated.Value(1)).current;
  const completionGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!streakPulseToken || prefersReducedMotion) return;
    streakScale.setValue(1);
    Animated.sequence([
      Animated.timing(streakScale, { toValue: 1.06, duration: 100, useNativeDriver: false }),
      Animated.timing(streakScale, { toValue: 1, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [streakPulseToken, prefersReducedMotion, streakScale]);

  useEffect(() => {
    if ((!isAllDone && !momentumHighlight) || prefersReducedMotion) return;
    Animated.parallel([
      Animated.sequence([
        Animated.timing(completionScale, { toValue: 1.02, duration: 120, useNativeDriver: false }),
        Animated.timing(completionScale, { toValue: 1, duration: 180, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.timing(completionGlow, { toValue: 1, duration: 120, useNativeDriver: false }),
        Animated.timing(completionGlow, { toValue: 0, duration: 260, useNativeDriver: false }),
      ]),
    ]).start();
  }, [isAllDone, momentumHighlight, prefersReducedMotion, completionScale, completionGlow]);

  const highlightStyle: StyleProp<ViewStyle> =
    momentumHighlight && !prefersReducedMotion
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: applyOpacity(themeColors.success, isDark ? 0.5 : 0.55),
        }
      : { borderWidth: 0, borderColor: 'transparent' };

  return (
    <Animated.View
      style={[
        styles.container,
        highlightStyle,
        {
          transform: [{ scale: completionScale }],
          shadowColor: themeColors.success,
          shadowOpacity: completionGlow.interpolate({ inputRange: [0, 1], outputRange: [0, isAllDone ? 0.18 : 0.1] }) as any,
          shadowRadius: completionGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) as any,
        },
      ]}
    >
      {streakDays > 0 && (
        <Animated.View style={{ transform: [{ scale: streakScale }], alignSelf: 'flex-start' }}>
          <Text style={[styles.streakLabel, { color: themeColors.textTertiary }]}>
            {streakDays} day streak
          </Text>
        </Animated.View>
      )}

      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: themeColors.text }]}>Daily Momentum</Text>
        <Text style={[styles.countBadge, { color: themeColors.text }]}>
          {safeCompleted}/{safeTotal}
        </Text>
      </View>

      <View style={[styles.tilesRow, isAllDone && styles.tilesRowComplete]}>
        {Array.from({ length: tileUnits }).map((_, i) => {
          const filled = i < filledTiles;
          const emptyBg = isDark ? themeColors.surfaceVariant : themeColors.border;
          const [g0, g1] = filledSegmentGradientColors(i, isDark, filledTiles);
          return (
            <View
              key={i}
              style={[
                styles.tile,
                {
                  flex: 1,
                  minWidth: 4,
                  height: TILE_HEIGHT,
                  backgroundColor: filled ? undefined : emptyBg,
                  opacity: filled ? 1 : isDark ? 0.55 : 0.78,
                  overflow: filled ? 'hidden' : 'visible',
                },
              ]}
            >
              {filled ? (
                <LinearGradient
                  colors={[g0, g1] as const}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {subText ? (
        <Text style={[styles.subText, { color: themeColors.textSecondary }]}>{subText}</Text>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  streakLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.2,
    marginBottom: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  countBadge: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  tilesRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    width: '100%',
    gap: 4,
    alignItems: 'center',
  },
  tilesRowComplete: {
    opacity: 1,
  },
  tile: {
    borderRadius: 4,
  },
  subText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
});
