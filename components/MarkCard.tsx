/**
 * MarkCard — Livra 2.0
 * Layer 2: Five visual states.
 * Layer 3: Full tap animation sequence (breathing, touch-begin scale, ripple, morph, icon pop).
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
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

// ─── Constants ──────────────────────────────────────────────────────────────

const BTN_SIZE = 44;
const ICON_SIZE = 40;
const FIXED_PILL_WIDTH = 10;
const FIXED_PILL_HEIGHT = 8;
const AMBER = '#E8960A';

// ─── State derivation ────────────────────────────────────────────────────────

type CardVisualState = 1 | 2 | 3 | 4 | 5;

function resolveCardState(
  isCompletedNow: boolean,
  streakCurrent: number,
  daysSinceLastLog: number,
  hour: number,
): CardVisualState {
  if (isCompletedNow && streakCurrent >= 5) return 3;
  if (isCompletedNow) return 2;
  if (daysSinceLastLog >= 3) return 5;
  if (hour >= 19 && streakCurrent >= 3) return 4;
  return 1;
}

interface CardTokens {
  cardOpacityBase: number;
  iconBgColor: string;
  iconColor: string;
  borderColor: string;
  borderWidth: number;
  glowShadow: object | null;
  showCompletionLine: boolean;
  breathingDuration: number;
}

function resolveTokens(
  state: CardVisualState,
  markColor: string,
  isDark: boolean,
  themeColors: (typeof colors)['dark'],
): CardTokens {
  const iconBgLogged   = markColor;
  const iconFgLogged   = foregroundForHexBackground(markColor, isDark);
  const iconBgUnlogged = applyOpacity(markColor, 0.40);
  const iconFgUnlogged = markColor;
  const normalBorder   = isDark
    ? applyOpacity(themeColors.border, 0.40)
    : applyOpacity(themeColors.border, 0.75);

  switch (state) {
    case 2:
      return { cardOpacityBase: 1.0, iconBgColor: iconBgLogged, iconColor: iconFgLogged, borderColor: normalBorder, borderWidth: StyleSheet.hairlineWidth, glowShadow: null, showCompletionLine: true, breathingDuration: 4000 };
    case 3:
      return { cardOpacityBase: 1.0, iconBgColor: iconBgLogged, iconColor: iconFgLogged, borderColor: applyOpacity(markColor, 0.18), borderWidth: 1, glowShadow: Platform.OS === 'ios' ? { shadowColor: markColor, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : null, showCompletionLine: true, breathingDuration: 4000 };
    case 4:
      return { cardOpacityBase: 0.85, iconBgColor: iconBgUnlogged, iconColor: iconFgUnlogged, borderColor: applyOpacity(AMBER, 0.55), borderWidth: 1, glowShadow: Platform.OS === 'ios' ? { shadowColor: AMBER, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null, showCompletionLine: false, breathingDuration: 3000 };
    case 5:
      return { cardOpacityBase: 0.70, iconBgColor: iconBgUnlogged, iconColor: iconFgUnlogged, borderColor: normalBorder, borderWidth: StyleSheet.hairlineWidth, glowShadow: null, showCompletionLine: false, breathingDuration: 5000 };
    default: // 1
      return { cardOpacityBase: 0.85, iconBgColor: iconBgUnlogged, iconColor: iconFgUnlogged, borderColor: normalBorder, borderWidth: StyleSheet.hairlineWidth, glowShadow: null, showCompletionLine: false, breathingDuration: 4000 };
  }
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MarkCardProps {
  mark: Mark;
  streak?: { current: number; longest: number };
  momentumScore?: number;
  todayCount: number;
  isCompleted: boolean;
  isCompact?: boolean;
  isActive?: boolean;
  nearCompletion?: number | null;
  hasNote?: boolean;
  daysSinceLastLog?: number;
  onPress: () => void;
  onIncrement: () => void;
  /**
   * Fires when logging this mark completes all marks for the day.
   * Home screen uses this to trigger the 3/3 ceremony.
   */
  onAllComplete?: () => void;
  iconType?: MarkType;
  weekCompletedDays?: boolean[];
}

export type HabitRowProps = MarkCardProps;

// ─── CompressedProgress ──────────────────────────────────────────────────────

export interface CompressedProgress {
  units: number; filled: number; partialFill: number; target: number; groupSize: number;
}

export function getCompressedProgress(todayCount: number, goalValue?: number | null): CompressedProgress {
  const target = goalValue && goalValue > 0 ? goalValue : 1;
  const cappedToday = Math.max(0, Math.min(todayCount, target));
  return { units: target, filled: cappedToday, partialFill: 0, target, groupSize: 1 };
}

// ─── Component ───────────────────────────────────────────────────────────────

export const MarkCard: React.FC<MarkCardProps> = ({
  mark,
  streak,
  momentumScore: _momentumScore,
  todayCount,
  isCompleted,
  isCompact = false,
  isActive = false,
  nearCompletion = null,
  hasNote = false,
  daysSinceLastLog = 0,
  onPress,
  onIncrement,
  onAllComplete,
  iconType,
  weekCompletedDays,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  useAppDateStore((s) => s.debugDateOverride ?? '');
  const markColor = getCategoryColorForMark({ name: mark.name, color: mark.color }) || themeColors.primary;
  const prefersReducedMotion = useReducedMotion();

  // ── Optimistic today-count ───────────────────────────────────────────
  const [optimisticExtra, setOptimisticExtra] = useState(0);
  useEffect(() => { setOptimisticExtra(0); }, [todayCount]);
  const displayTodayCount = todayCount + optimisticExtra;

  const dailyTarget = resolveDailyTarget(mark);
  const resolvedIconType = iconType ?? 'focus';
  const isCompletedNow = displayTodayCount >= dailyTarget || isCompleted;
  const cappedTodayCount = Math.min(displayTodayCount, dailyTarget);
  const actualRemaining = Math.max(0, dailyTarget - displayTodayCount);
  const showProgressFraction = dailyTarget > 1 && !isCompletedNow;
  const helperLabel = showProgressFraction ? `${cappedTodayCount}/${dailyTarget}` : null;
  const compressed = getCompressedProgress(displayTodayCount, dailyTarget);

  // ── State / tokens ───────────────────────────────────────────────────
  const hour = getAppDate().getHours();
  const streakCurrent = streak?.current ?? 0;
  const cardState = resolveCardState(isCompletedNow, streakCurrent, daysSinceLastLog, hour);
  const tokens = resolveTokens(cardState, markColor, isDark, themeColors);
  const todayWeekDayIndex = (getAppDate().getDay() + 6) % 7;
  const isNearComplete = !isCompletedNow && actualRemaining === 1;

  // ── Reanimated shared values ─────────────────────────────────────────
  const cardOpacity  = useSharedValue(tokens.cardOpacityBase);
  const cardScale    = useSharedValue(1);
  const btnScale     = useSharedValue(1);
  const iconScale    = useSharedValue(1);
  const morphProgress = useSharedValue(isCompleted ? 1 : 0);
  const rippleScale  = useSharedValue(1);
  const rippleOpacity = useSharedValue(0);
  const dayDotFill   = useSharedValue(isCompletedNow ? 1 : 0);

  // ── Sync card opacity with state tokens when state changes externally
  useEffect(() => {
    if (!isCompletedNow) {
      cardOpacity.value = withTiming(tokens.cardOpacityBase, { duration: 250 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState]);

  // ── Breathing animation ──────────────────────────────────────────────
  useEffect(() => {
    cancelAnimation(iconScale);
    if (isCompletedNow || prefersReducedMotion) {
      iconScale.value = withTiming(1.0, { duration: 200 });
      return;
    }
    const half = tokens.breathingDuration / 2;
    iconScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: half, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0,  { duration: half, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => { cancelAnimation(iconScale); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompletedNow, cardState, prefersReducedMotion]);

  // ── Ref for icon pop timer cleanup ──────────────────────────────────
  const iconPopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (iconPopTimer.current) clearTimeout(iconPopTimer.current); }, []);

  // ── +→✓ checkmark state (JS side for icon swap trigger) ─────────────
  const [showCheckmark, setShowCheckmark] = useState(() => isCompletedNow);
  useEffect(() => {
    if (!isCompletedNow) {
      setShowCheckmark(false);
      morphProgress.value = withTiming(0, { duration: 50 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompletedNow]);

  // ── Touch begin ──────────────────────────────────────────────────────
  const handlePressIn = useCallback(() => {
    if (isCompletedNow || prefersReducedMotion) return;
    cardScale.value = withSpring(0.98, { damping: 20, stiffness: 350 });
    btnScale.value  = withSpring(0.92, { damping: 20, stiffness: 350 });
  }, [isCompletedNow, prefersReducedMotion, cardScale, btnScale]);

  const handlePressOut = useCallback(() => {
    cardScale.value = withSpring(1.0, { damping: 15, stiffness: 250 });
    btnScale.value  = withSpring(1.0, { damping: 15, stiffness: 250 });
  }, [cardScale, btnScale]);

  // ── Main tap ─────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    if (isCompletedNow) return;

    const newExtra   = optimisticExtra + 1;
    const newToday   = todayCount + newExtra;
    const willComplete = newToday >= dailyTarget;

    setOptimisticExtra(newExtra);

    // Haptic: Success on 3/3 completion, Heavy for normal logs
    if (Platform.OS !== 'web') {
      if (willComplete) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }

    // Spring card + btn back
    cardScale.value = withSpring(1.0, { damping: 12, stiffness: 200 });
    btnScale.value  = withSpring(1.0, { damping: 12, stiffness: 200 });

    // Card opacity springs to 1.0
    cardOpacity.value = withSpring(1.0, { damping: 14, stiffness: 180 });

    if (!prefersReducedMotion) {
      // Ripple from button center (300ms)
      rippleScale.value   = 1.0;
      rippleOpacity.value = 0.6;
      rippleScale.value   = withTiming(1.5, { duration: 300, easing: Easing.out(Easing.ease) });
      rippleOpacity.value = withTiming(0,   { duration: 300, easing: Easing.out(Easing.ease) });

      // +→✓ morph (200ms)
      morphProgress.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) runOnJS(setShowCheckmark)(true);
      });

      // Day dot liquid fill: starts at 300ms, fills over 600ms
      dayDotFill.value = 0;
      setTimeout(() => {
        dayDotFill.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) });
      }, 300);

      // Icon breathing stops; icon pop at 820ms
      cancelAnimation(iconScale);
      iconScale.value = withTiming(1.0, { duration: 150 });
      iconPopTimer.current = setTimeout(() => {
        const popTarget = cardState === 5 ? 1.25 : 1.18;
        iconScale.value = withSequence(
          withSpring(popTarget, { damping: 8, stiffness: 250 }),
          withSpring(1.0,       { damping: 12, stiffness: 200 }),
        );
      }, 820);
    } else {
      setShowCheckmark(willComplete);
    }

    onIncrement();

    if (willComplete && onAllComplete) {
      onAllComplete();
    }
  }, [
    isCompletedNow, optimisticExtra, todayCount, dailyTarget, cardState,
    prefersReducedMotion, cardOpacity, cardScale, btnScale,
    rippleScale, rippleOpacity, morphProgress, iconScale, dayDotFill,
    onIncrement, onAllComplete,
  ]);

  // ── Animated styles ──────────────────────────────────────────────────
  const cardOuterStyle = useAnimatedStyle(() => ({
    opacity:   cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const plusIconStyle = useAnimatedStyle(() => ({
    opacity:   1 - morphProgress.value,
    transform: [{ scale: 1 - morphProgress.value * 0.3 }],
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    opacity:   morphProgress.value,
    transform: [{ scale: 0.7 + morphProgress.value * 0.3 }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity:   rippleOpacity.value,
    transform: [{ scale: rippleScale.value }],
  }));

  const dayDotFillStyle = useAnimatedStyle(() => ({
    height: `${Math.round(dayDotFill.value * 100)}%` as any,
  }));

  const cardSheenLight = [
    applyOpacity('#FFFFFF', 0.14),
    'rgba(255,255,255,0)',
    applyOpacity(themeColors.border, 0.12),
  ] as const;

  const btnFg = foregroundForHexBackground(markColor, isDark);

  // ── Compact render ───────────────────────────────────────────────────
  if (isCompact) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: 'rgba(128,128,128,0.05)' }}
        style={[
          styles.compactCard,
          { backgroundColor: themeColors.surfaceVariant, borderColor: applyOpacity(themeColors.border, isDark ? 0.55 : 0.9) },
        ]}
      >
        <View style={styles.compactRow}>
          <View style={[styles.compactIcon, { backgroundColor: applyOpacity(markColor, 0.22) }]}>
            <MarkIcon type={resolvedIconType} size={18} variant="symbol" animate="none" ariaLabel={`${mark.name} icon`} color={applyOpacity(markColor, 0.80)} />
          </View>
          <View style={styles.compactIdentity}>
            <AppText numberOfLines={1} style={[styles.compactName, { color: themeColors.textSecondary }]}>{mark.name}</AppText>
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

  // ── Full render ──────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.cardOuter, cardOuterStyle, tokens.glowShadow ?? {}]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{ color: 'rgba(128,128,128,0.06)' }}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? themeColors.surface : (isCompletedNow ? themeColors.surfaceVariant : themeColors.surface),
            borderColor: tokens.borderColor,
            borderWidth: tokens.borderWidth,
          },
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

        <View style={styles.rowContent}>
          {/* Icon with breathing scale */}
          <Animated.View style={[styles.iconWrap, { backgroundColor: tokens.iconBgColor }, iconAnimStyle]}>
            <MarkIcon type={resolvedIconType} size={22} variant="symbol" animate="none" ariaLabel={`${mark.name} icon`} color={tokens.iconColor} />
          </Animated.View>

          {/* Name + progress */}
          <View style={styles.identitySection}>
            <View style={styles.nameRow}>
              <AppText
                numberOfLines={1}
                style={[
                  styles.name,
                  { color: themeColors.text, fontWeight: isActive && !isCompletedNow ? fontWeight.bold : fontWeight.semibold, flex: 1 },
                ]}
              >
                {mark.name}
              </AppText>
              {hasNote && (
                <View style={[styles.noteDot, { backgroundColor: applyOpacity(themeColors.textSecondary, 0.55) }]} />
              )}
            </View>

            {helperLabel !== null && (
              <AppText style={[styles.metaText, { color: isCompletedNow ? themeColors.textSecondary : themeColors.textTertiary, fontWeight: isCompletedNow ? fontWeight.medium : fontWeight.normal }]}>
                {helperLabel}
              </AppText>
            )}

            {dailyTarget > 1 && (
              <View style={styles.pillsRow}>
                {Array.from({ length: compressed.units }).map((_, i) => {
                  const isFull = i < compressed.filled;
                  const isPartial = i === compressed.filled && compressed.partialFill > 0;
                  const trackBg = isDark ? applyOpacity(themeColors.border, 0.55) : applyOpacity(themeColors.border, 0.95);
                  return (
                    <View key={i} style={styles.pillOuter}>
                      <View style={[styles.pillTrack, { backgroundColor: trackBg }]}>
                        {isFull ? <View style={[styles.pillFillFull, { backgroundColor: markColor }]} /> : isPartial ? <View style={[styles.pillFillPartial, { height: `${Math.round(compressed.partialFill * 100)}%`, backgroundColor: markColor }]} /> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Weekly dots — today's dot uses liquid fill animation */}
            {weekCompletedDays && weekCompletedDays.length === 7 && (
              <View style={styles.weeklyDots}>
                {weekCompletedDays.map((completedByEvents, i) => {
                  const isToday  = i === todayWeekDayIndex;
                  const isFuture = i > todayWeekDayIndex;
                  const isDotFilled = isToday ? isCompletedNow : completedByEvents;
                  if (isToday) {
                    return (
                      <View
                        key={i}
                        style={[
                          styles.weeklyDot,
                          {
                            backgroundColor: isDotFilled
                              ? 'transparent'
                              : (isDark ? applyOpacity(themeColors.surfaceActive, 0.78) : applyOpacity(themeColors.border, 0.86)),
                            borderWidth: 1,
                            borderColor: isDotFilled
                              ? applyOpacity(markColor, isDark ? 0.70 : 0.55)
                              : (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'),
                            overflow: 'hidden',
                          },
                          isNearComplete && !prefersReducedMotion ? { transform: [{ scale: 1.05 }] } : null,
                        ]}
                      >
                        {/* Liquid fill from bottom */}
                        <Animated.View
                          style={[
                            styles.dotLiquidFill,
                            { backgroundColor: applyOpacity(markColor, isDark ? 0.84 : 0.72) },
                            dayDotFillStyle,
                          ]}
                        />
                      </View>
                    );
                  }
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
                        },
                      ]}
                    />
                  );
                })}
              </View>
            )}
          </View>

          {/* Action button */}
          <View style={styles.rightSection}>
            {/* Ripple behind button */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ripple,
                { backgroundColor: applyOpacity(markColor, 0.60) },
                rippleStyle,
              ]}
            />
            <Animated.View style={btnAnimStyle}>
              <Pressable
                onPressIn={isCompletedNow ? undefined : handlePressIn}
                onPressOut={isCompletedNow ? undefined : handlePressOut}
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
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                {/* +  (fades out on morph) */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.btnIconWrap, plusIconStyle]}>
                  <AppText style={[styles.actionText, { color: btnFg }]}>+</AppText>
                </Animated.View>
                {/* ✓  (fades in on morph) */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.btnIconWrap, checkIconStyle]}>
                  <Ionicons name="checkmark" size={24} color={btnFg} />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* Completion line — 2px accent at bottom, visible in States 2 & 3 */}
        {tokens.showCompletionLine && (
          <View style={[styles.completionLine, { backgroundColor: markColor }]} />
        )}
      </Pressable>
    </Animated.View>
  );
};

// ─── Backward-compatible aliases ─────────────────────────────────────────────

export const HabitRow = MarkCard;

export const HabitRowCounter: React.FC<Omit<MarkCardProps, 'mark'> & { counter: Mark }> = React.memo(
  ({ counter, ...rest }) => <MarkCard mark={counter} {...rest} />,
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
    prev.daysSinceLastLog === next.daysSinceLastLog &&
    prev.iconType === next.iconType &&
    prev.onPress === next.onPress &&
    prev.onIncrement === next.onIncrement &&
    JSON.stringify(prev.weekCompletedDays) === JSON.stringify(next.weekCompletedDays),
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardOuter: {},
  card: {
    borderRadius: borderRadius.card,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    height: 68,
    overflow: 'hidden',
  },
  compactCard: {
    borderRadius: borderRadius.md, marginHorizontal: spacing.lg, marginVertical: 2,
    borderWidth: StyleSheet.hairlineWidth, height: 52, overflow: 'hidden', justifyContent: 'center',
  },
  compactRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  compactIcon: { width: 32, height: 32, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  compactIdentity: { flex: 1, minWidth: 0, gap: 1 },
  compactName: { fontSize: fontSize.sm, lineHeight: 18, letterSpacing: -0.1 },
  compactFraction: { fontSize: 10, lineHeight: 13, flexShrink: 0 },
  compactCheckCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardLightShell: { overflow: 'hidden' },
  cardSheen: { ...StyleSheet.absoluteFill, borderRadius: borderRadius.card },
  rowContent: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: spacing.md, gap: spacing.sm },
  iconWrap: { width: ICON_SIZE, height: ICON_SIZE, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  identitySection: { flex: 1, gap: spacing.xs, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  name: { fontSize: fontSize.md, lineHeight: 20, letterSpacing: -0.1 },
  noteDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  metaText: { fontSize: 10, lineHeight: 12 },
  rightSection: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ripple: {
    position: 'absolute',
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
  },
  actionBtn: { width: BTN_SIZE, height: BTN_SIZE, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  btnIconWrap: { alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 24, fontWeight: fontWeight.bold, lineHeight: 26, includeFontPadding: false },
  completionLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 },
  weeklyDots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  weeklyDot: { width: 12, height: 7, borderRadius: 4 },
  dotLiquidFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 4 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: spacing.xxs, minHeight: FIXED_PILL_HEIGHT },
  pillOuter: { width: FIXED_PILL_WIDTH, height: FIXED_PILL_HEIGHT },
  pillTrack: { width: FIXED_PILL_WIDTH, height: FIXED_PILL_HEIGHT, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  pillFillFull: { ...StyleSheet.absoluteFill, borderRadius: 4 },
  pillFillPartial: { width: '100%', borderRadius: 4 },
});
