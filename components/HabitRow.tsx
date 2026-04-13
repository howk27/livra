import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Mark } from '../types';
import { resolveDailyTarget } from '../lib/markDailyTarget';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import MarkIcon from '@/src/components/icons/CounterIcon';
import type { MarkType } from '@/src/types/counters';
import { applyOpacity, foregroundForHexBackground } from '@/src/components/icons/color';
import { getCategoryColorForMark } from '../lib/markCategory';
import { getAppDate } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';

const BTN_SIZE = 44;
const ICON_SIZE = 40;
const FIXED_PILL_WIDTH = 10;
const FIXED_PILL_HEIGHT = 8;

export interface HabitRowProps {
  mark: Mark;
  streak?: { current: number; longest: number };
  momentumScore?: number;
  todayCount: number;
  isCompleted: boolean;
  isCompact?: boolean;
  isActive?: boolean;
  nearCompletion?: number | null;
  hasNote?: boolean;
  onPress: () => void;
  onIncrement: () => void;
  iconType?: MarkType;
  /**
   * 7 booleans [Mon=0 … Sun=6] — true when the daily goal was fully met that day.
   * Today's slot is overridden by the optimistic `isCompletedNow` value inside the row.
   */
  weekCompletedDays?: boolean[];
}

export interface CompressedProgress {
  units: number;
  filled: number;
  partialFill: number;
  target: number;
  groupSize: number;
}

export function getCompressedProgress(
  todayCount: number,
  goalValue?: number | null,
): CompressedProgress {
  const target = goalValue && goalValue > 0 ? goalValue : 1;
  const cappedToday = Math.max(0, Math.min(todayCount, target));
  return {
    units: target,
    filled: cappedToday,
    partialFill: 0,
    target,
    groupSize: 1,
  };
}

export const HabitRow: React.FC<HabitRowProps> = ({
  mark,
  streak: _streak,
  momentumScore: _momentumScore,
  todayCount,
  isCompleted,
  isCompact = false,
  isActive = false,
  nearCompletion = null,
  hasNote = false,
  onPress,
  onIncrement,
  iconType,
  weekCompletedDays,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const markColor = getCategoryColorForMark({ name: mark.name, color: mark.color }) || themeColors.primary;
  const prefersReducedMotion = useReducedMotion();

  // ── Optimistic today-count ───────────────────────────────────────
  const [optimisticExtra, setOptimisticExtra] = useState(0);
  useEffect(() => { setOptimisticExtra(0); }, [todayCount]);
  const displayTodayCount = todayCount + optimisticExtra;

  const dailyTarget = resolveDailyTarget(mark);
  /** Registry fallback so every row uses the same outline SVG system (no emoji tile). */
  const resolvedIconType = iconType ?? 'focus';
  const isCompletedNow = displayTodayCount >= dailyTarget || isCompleted;
  const cappedTodayCount = Math.min(displayTodayCount, dailyTarget);
  const actualRemaining = Math.max(0, dailyTarget - displayTodayCount);
  const showProgressFraction = dailyTarget > 1 && !isCompletedNow;
  const helperLabel = showProgressFraction ? `${cappedTodayCount}/${dailyTarget}` : null;

  const compressed = getCompressedProgress(displayTodayCount, dailyTarget);

  // ── Today's position in the Mon-Sun week (Mon=0, Sun=6) ─────────
  const todayWeekDayIndex = ((getAppDate().getDay() + 6) % 7);

  // ── Morph: controls +→✓ icon swap independently of isCompletedNow ──
  // Initialised true if already complete on mount so no animation plays on load.
  const [showCheckmark, setShowCheckmark] = useState(() => isCompletedNow);
  useEffect(() => {
    if (!isCompletedNow) {
      // Data refreshed, habit is no longer complete (e.g. sync corrected count)
      setShowCheckmark(false);
      btnMorphAnim.setValue(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompletedNow]);

  // ── Animation values ────────────────────────────────────────────
  // Button press scale (press-in / press-out)
  const btnScaleAnim          = useRef(new Animated.Value(1)).current;
  // Button morph scale (+→✓ transition)
  const btnMorphAnim          = useRef(new Animated.Value(1)).current;
  // White flash inside button on tap
  const btnFlashAnim          = useRef(new Animated.Value(0)).current;
  // Row press-in highlight overlay
  const rowPressAnim          = useRef(new Animated.Value(0)).current;
  // Row flash on tap / completion glow
  const rowFlashAnim          = useRef(new Animated.Value(0)).current;
  const completionGlowAnim    = useRef(new Animated.Value(0)).current;

  const isNearComplete = !isCompletedNow && actualRemaining === 1;

  // ── Tap animation: single segment compress→expand, row flash ────
  const triggerTapAnimation = useCallback(
    () => {
      if (prefersReducedMotion) return;

      // White flash inside button
      Animated.sequence([
        Animated.timing(btnFlashAnim, { toValue: 1, duration: 40, useNativeDriver: true }),
        Animated.timing(btnFlashAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();

      // Subtle row background flash
      rowFlashAnim.setValue(0.18);
      Animated.timing(rowFlashAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start();
    },
    [prefersReducedMotion, btnFlashAnim, rowFlashAnim],
  );

  // ── Completion animation: all-pills pulse + button morph ─────────
  const triggerCompletionAnimation = useCallback(() => {
    if (prefersReducedMotion) return;

    // Row glow
    completionGlowAnim.setValue(0.28);
    Animated.timing(completionGlowAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();

    // Button morph: scale down → swap icon → scale back up
    Animated.timing(btnMorphAnim, { toValue: 0.82, duration: 100, useNativeDriver: true }).start(() => {
      setShowCheckmark(true);
      Animated.timing(btnMorphAnim, { toValue: 1.0, duration: 130, useNativeDriver: true }).start();
    });
  }, [prefersReducedMotion, completionGlowAnim, btnMorphAnim]);

  // ── Button press-in / press-out ──────────────────────────────────
  const handleBtnPressIn = useCallback(() => {
    if (prefersReducedMotion) return;
    Animated.timing(btnScaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }).start();
  }, [prefersReducedMotion, btnScaleAnim]);

  const handleBtnPressOut = useCallback(() => {
    if (prefersReducedMotion) return;
    Animated.timing(btnScaleAnim, { toValue: 1.0, duration: 120, useNativeDriver: true }).start();
  }, [prefersReducedMotion, btnScaleAnim]);

  // ── Row press-in / press-out ─────────────────────────────────────
  const handleRowPressIn = useCallback(() => {
    if (prefersReducedMotion) return;
    Animated.timing(rowPressAnim, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  }, [prefersReducedMotion, rowPressAnim]);

  const handleRowPressOut = useCallback(() => {
    if (prefersReducedMotion) return;
    Animated.timing(rowPressAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }, [prefersReducedMotion, rowPressAnim]);

  // ── Main tap handler ─────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (isCompletedNow) return;

    const newExtra   = optimisticExtra + 1;
    const newToday   = todayCount + newExtra;
    const willComplete = newToday >= dailyTarget;

    // Optimistic state — must be first so re-render is instant
    setOptimisticExtra(newExtra);

    // Haptics
    if (Platform.OS !== 'web') {
      if (willComplete) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }

    triggerTapAnimation();
    if (willComplete) triggerCompletionAnimation();

    onIncrement();
  }, [
    isCompletedNow, optimisticExtra, todayCount, dailyTarget,
    triggerTapAnimation, triggerCompletionAnimation, onIncrement,
  ]);

  // ── Micro label ──────────────────────────────────────────────────

  // ── Derived flags ────────────────────────────────────────────────
  const cardBg = isCompletedNow
    ? themeColors.surfaceVariant
    : isActive
      ? themeColors.surfaceActive
      : themeColors.surface;
  const cardBorder = isDark
    ? applyOpacity(themeColors.border, isCompletedNow ? 0.55 : 0.40)
    : applyOpacity(themeColors.border, isCompletedNow ? 0.9 : 0.75);
  const iconBgTint = applyOpacity(markColor, isDark ? 0.20 : 0.14);
  const buttonFg = foregroundForHexBackground(markColor, isDark);

  /** Light only: barely-there sheen so rows read as a surface above the mint page tint. */
  const cardSheenLight = [
    applyOpacity('#FFFFFF', 0.14),
    'rgba(255,255,255,0)',
    applyOpacity(themeColors.border, 0.12),
  ] as const;

  const btnShadow =
    isActive && !isCompletedNow
      ? { shadowColor: markColor, shadowRadius: 10, shadowOpacity: 0.45, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
      : undefined;

  // Combined button transform: press scale × morph scale
  const btnCombinedScale = Animated.multiply(btnScaleAnim, btnMorphAnim);

  // ── Compact render (Done Today section) ─────────────────────────
  if (isCompact) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: 'rgba(128,128,128,0.05)' }}
        style={[
          styles.compactCard,
          { backgroundColor: themeColors.surfaceVariant, borderColor: cardBorder },
        ]}
      >
        <View style={styles.compactRow}>
          <View style={[styles.compactIcon, { backgroundColor: iconBgTint }]}>
            <MarkIcon
              type={resolvedIconType}
              size={18}
              variant="symbol"
              animate="none"
              ariaLabel={`${mark.name} icon`}
              color={applyOpacity(markColor, 0.80)}
            />
          </View>
          <View style={styles.compactIdentity}>
            <AppText
              numberOfLines={1}
              style={[styles.compactName, { color: themeColors.textSecondary }]}
            >
              {mark.name}
            </AppText>
            {dailyTarget > 1 && (
              <AppText style={[styles.compactFraction, { color: themeColors.textTertiary }]}>
                {Math.min(displayTodayCount, dailyTarget)}/{dailyTarget}
              </AppText>
            )}
          </View>
          <View style={[styles.compactCheckCircle, { backgroundColor: applyOpacity(markColor, 0.18) }]}>
            <Ionicons name="checkmark" size={14} color={applyOpacity(markColor, 0.85)} />
          </View>
        </View>
      </Pressable>
    );
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <Pressable
      onPress={onPress}
      onPressIn={handleRowPressIn}
      onPressOut={handleRowPressOut}
      android_ripple={{ color: 'rgba(128,128,128,0.06)' }}
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
        isDark ? shadow.sm : styles.cardLightShell,
      ]}
    >
      {!isDark && (
        <LinearGradient
          pointerEvents="none"
          colors={[...cardSheenLight]}
          start={{ x: 0.18, y: 0 }}
          end={{ x: 0.82, y: 1 }}
          style={styles.cardSheen}
        />
      )}
      {/* Row press-in highlight */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: themeColors.surfaceActive,
            borderRadius: borderRadius.card,
            opacity: rowPressAnim,
          },
        ]}
      />

      {/* Row tap flash + completion glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: markColor + '28',
            borderRadius: borderRadius.card,
            opacity: Animated.add(rowFlashAnim, completionGlowAnim),
          },
        ]}
      />

      <View style={styles.rowContent}>
        {/* ── Icon ── */}
        <View style={[styles.iconWrap, { backgroundColor: iconBgTint }]}>
          <MarkIcon
            type={resolvedIconType}
            size={22}
            variant="symbol"
            animate="none"
            ariaLabel={`${mark.name} icon`}
            color={markColor}
          />
        </View>

        {/* ── Name + pills ── */}
        <View style={styles.identitySection}>
          <View style={styles.nameRow}>
            <AppText
              numberOfLines={1}
              style={[
                styles.name,
                {
                  color: themeColors.text,
                  fontWeight: isActive && !isCompletedNow ? fontWeight.bold : fontWeight.semibold,
                  flex: 1,
                },
              ]}
            >
              {mark.name}
            </AppText>
            {hasNote && (
              <View style={[styles.noteDot, { backgroundColor: applyOpacity(themeColors.textSecondary, 0.55) }]} />
            )}
          </View>

          {/* Minimal helper label for clarity */}
          {helperLabel !== null && (
            <AppText
              style={[
                styles.metaText,
                {
                  color: isCompletedNow
                    ? (isDark ? themeColors.textSecondary : themeColors.textSecondary)
                    : themeColors.textTertiary,
                  fontWeight: isCompletedNow ? fontWeight.medium : fontWeight.normal,
                },
              ]}
            >
              {helperLabel}
            </AppText>
          )}

          {dailyTarget > 1 && (
            <View style={styles.pillsRow}>
              {Array.from({ length: compressed.units }).map((_, i) => {
                const isFull = i < compressed.filled;
                const isPartial = i === compressed.filled && compressed.partialFill > 0;
                const trackBg = isDark
                  ? applyOpacity(themeColors.border, 0.55)
                  : applyOpacity(themeColors.border, 0.95);
                return (
                  <View key={i} style={styles.pillOuter}>
                    <View style={[styles.pillTrack, { backgroundColor: trackBg }]}>
                      {isFull ? (
                        <View style={[styles.pillFillFull, { backgroundColor: markColor }]} />
                      ) : isPartial ? (
                        <View
                          style={[
                            styles.pillFillPartial,
                            {
                              height: `${Math.round(compressed.partialFill * 100)}%`,
                              backgroundColor: markColor,
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Weekly consistency dots (Mon → Sun) ────────────────── */}
          {weekCompletedDays && weekCompletedDays.length === 7 && (
            <View style={styles.weeklyDots}>
              {weekCompletedDays.map((completedByEvents, i) => {
                const isToday    = i === todayWeekDayIndex;
                const isFuture   = i > todayWeekDayIndex;
                // Use optimistic completion for today, event-based for past days
                const isDotFilled = isToday ? isCompletedNow : completedByEvents;
                return (
                  <View
                    key={i}
                    style={[
                      styles.weeklyDot,
                      {
                        backgroundColor: isDotFilled
                          ? applyOpacity(markColor, isDark ? 0.84 : 0.72)
                          : isFuture
                            ? 'transparent'
                            : (isDark ? applyOpacity(themeColors.surfaceActive, 0.78) : applyOpacity(themeColors.border, 0.86)),
                        // Today gets a subtle outline so it is always identifiable
                        borderWidth: isToday ? 1 : 0,
                        borderColor: isToday
                          ? (isDotFilled
                              ? applyOpacity(markColor, isDark ? 0.70 : 0.55)
                              : (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'))
                          : 'transparent',
                      },
                      isNearComplete && isToday && !prefersReducedMotion
                        ? { transform: [{ scale: 1.05 }] }
                        : null,
                    ]}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* ── Action button — single Pressable, icon swaps via showCheckmark ── */}
        <View style={styles.rightSection}>
          <Animated.View style={{ transform: [{ scale: btnCombinedScale }] }}>
            <Pressable
              onPressIn={isCompletedNow ? undefined : handleBtnPressIn}
              onPressOut={isCompletedNow ? undefined : handleBtnPressOut}
              onPress={isCompletedNow ? undefined : handleTap}
              android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: showCheckmark
                    ? (isDark ? applyOpacity(markColor, 0.90) : applyOpacity(markColor, 0.86))
                    : markColor,
                  overflow: 'hidden',
                  borderWidth: !isDark ? 1 : 0,
                  borderColor: !isDark ? applyOpacity(markColor, 0.38) : 'transparent',
                },
                !showCheckmark && btnShadow,
              ]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {/* White flash overlay on tap */}
              {!showCheckmark && (
                <Animated.View
                  style={[StyleSheet.absoluteFillObject, styles.btnFlash, { opacity: btnFlashAnim }]}
                />
              )}
              {showCheckmark ? (
                <Ionicons name="checkmark" size={24} color={buttonFg} />
              ) : (
                <AppText style={[styles.actionText, { color: buttonFg }]}>+</AppText>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
};

// Counter-alias wrapper
export const HabitRowCounter: React.FC<Omit<HabitRowProps, 'mark'> & { counter: Mark }> = React.memo(
  ({ counter, ...rest }) => <HabitRow mark={counter} {...rest} />,
  (prev, next) =>
    prev.counter.id === next.counter.id &&
    prev.counter.total === next.counter.total &&
    prev.counter.updated_at === next.counter.updated_at &&
    prev.counter.name === next.counter.name &&
    prev.counter.color === next.counter.color &&
    prev.counter.emoji === next.counter.emoji &&
    prev.counter.unit === next.counter.unit &&
    prev.counter.dailyTarget === next.counter.dailyTarget &&
    prev.streak?.current === next.streak?.current &&
    prev.momentumScore === next.momentumScore &&
    prev.todayCount === next.todayCount &&
    prev.isCompleted === next.isCompleted &&
    prev.isCompact === next.isCompact &&
    prev.isActive === next.isActive &&
    prev.nearCompletion === next.nearCompletion &&
    prev.hasNote === next.hasNote &&
    prev.iconType === next.iconType &&
    prev.onPress === next.onPress &&
    prev.onIncrement === next.onIncrement &&
    JSON.stringify(prev.weekCompletedDays) === JSON.stringify(next.weekCompletedDays),
);

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.card,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    height: 68,
    overflow: 'hidden',
  },
  compactCard: {
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  compactName: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  compactFraction: {
    fontSize: 10,
    lineHeight: 13,
    flexShrink: 0,
  },
  compactCheckCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /** Light: clip sheen to radius; shadow omitted here (gloss + border carry depth). */
  cardLightShell: {
    overflow: 'hidden',
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.card,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  identitySection: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  name: {
    fontSize: fontSize.md,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  noteDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  metaText: {
    fontSize: 10,
    lineHeight: 12,
  },
  rightSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    lineHeight: 26,
    includeFontPadding: false,
  },
  btnFlash: {
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderRadius: borderRadius.full,
  },

  // ── Weekly consistency indicator ─────────────────────────────────
  weeklyDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  weeklyDot: {
    width: 12,
    height: 7,
    borderRadius: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xxs,
    minHeight: FIXED_PILL_HEIGHT,
  },
  pillOuter: {
    width: FIXED_PILL_WIDTH,
    height: FIXED_PILL_HEIGHT,
  },
  pillTrack: {
    width: FIXED_PILL_WIDTH,
    height: FIXED_PILL_HEIGHT,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  pillFillFull: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
  },
  pillFillPartial: {
    width: '100%',
    borderRadius: 4,
  },
});
