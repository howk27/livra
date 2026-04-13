import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Mark } from '../types';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow, motion } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import MarkIcon from '@/src/components/icons/CounterIcon';
import type { MarkType, MarkIconAnimation } from '@/src/types/counters';
import { ICON_ANIMATION_TIMING, ICON_BACKGROUND_ALPHA } from '@/src/components/icons/IconTokens';
import { applyOpacity } from '@/src/components/icons/color';
import { getCategoryColorForMark } from '../lib/markCategory';

const TILE_HEIGHT = 178;

interface MarkTileProps {
  mark: Mark;
  streak?: { current: number; longest: number };
  momentumScore?: number; // Days active in last 10 — shown alongside streak
  onPress: () => void;
  onIncrement: () => void;
  onDecrement?: () => void;
  onDelete?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  interactionsEnabled?: boolean;
  iconType?: MarkType;
}

export const MarkTile: React.FC<MarkTileProps> = ({
  mark,
  streak,
  momentumScore,
  onPress,
  onIncrement,
  onDecrement,
  onDelete,
  onLongPress,
  onPressIn,
  onPressOut,
  interactionsEnabled = true,
  iconType,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const iconPulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current; // White flash overlay for + button
  const markColor = getCategoryColorForMark({ name: mark.name, color: mark.color }) || themeColors.primary;
  const prefersReducedMotion = useReducedMotion();
  const [iconAnimation, setIconAnimation] = useState<MarkIconAnimation>('none');
  const iconAnimationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // OPTIMISTIC LOCAL STATE: Update UI instantly before store sync
  // This bypasses the Zustand -> React re-render cycle for instant feedback
  const [optimisticTotal, setOptimisticTotal] = useState<number | null>(null);
  const optimisticTotalRef = useRef<number | null>(null);
  
  // Sync optimistic state with prop changes (when store updates)
  useEffect(() => {
    if (optimisticTotalRef.current === null || optimisticTotalRef.current === mark.total) {
      setOptimisticTotal(null);
      optimisticTotalRef.current = null;
    }
  }, [mark.total]);
  
  // Use optimistic total if available, otherwise use mark.total
  const displayTotal = optimisticTotal !== null ? optimisticTotal : mark.total;

  // No-op: animation is fully driven by handleIncrementPress / handleDecrementPress above
  // Keeping hook call to avoid conditional hook ordering issues
  useEffect(() => {}, [displayTotal, prefersReducedMotion, pulseAnim]);

  const handleIncrementPress = () => {
    if (!interactionsEnabled) return;
    
    // Section 3 — pop animation 0.95 → 1.05 → 1.0 + color flash
    if (!prefersReducedMotion) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.95, duration: 55, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 90, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 70, useNativeDriver: true }),
      ]).start();
      // Color flash on + button
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
    
    // Icon animation for immediate feedback
    if (iconAnimationTimeout.current) {
      clearTimeout(iconAnimationTimeout.current);
    }
    setIconAnimation('increment');
    iconAnimationTimeout.current = setTimeout(() => {
      setIconAnimation('none');
    }, ICON_ANIMATION_TIMING.increment);
    
    // INSTANT OPTIMISTIC UPDATE: Update local state immediately (bypasses store)
    const newTotal = displayTotal + 1;
    optimisticTotalRef.current = newTotal;
    setOptimisticTotal(newTotal);
    
    // Visual/haptic feedback happens in parallel (non-blocking)
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Animate button press - quick shrink per spec (80-120ms tap feedback)
    if (!prefersReducedMotion) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: motion.quick,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
    
    // CRITICAL: Call increment for store sync (happens in background, non-blocking)
    onIncrement();
  };

  const handleDecrementPress = () => {
    if (!interactionsEnabled || !onDecrement || displayTotal <= 0) return;
    
    // Section 3 — softer pop for decrement
    if (!prefersReducedMotion) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.97, duration: 60, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 80, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 60, useNativeDriver: true }),
      ]).start();
    }

    // INSTANT OPTIMISTIC UPDATE: Update local state immediately (bypasses store)
    const newTotal = Math.max(0, displayTotal - 1);
    optimisticTotalRef.current = newTotal;
    setOptimisticTotal(newTotal);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // CRITICAL: Call decrement once for store sync
    onDecrement();
  };

  const handlePress = () => {
    if (!interactionsEnabled) return;
    onPress();
  };
  useEffect(
    () => () => {
      if (iconAnimationTimeout.current) {
        clearTimeout(iconAnimationTimeout.current);
      }
    },
    []
  );


  // Phase 3.2 — subtle color-tinted card background
  const cardBgColor = applyOpacity(markColor, 0.06);

  // Use border.soft per spec
  const strokeColor = themeColors.border;

  const handleDeletePress = () => {
    if (!onDelete) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete();
  };

  // When interactions are disabled, use a plain View to avoid blocking drag gestures
  if (!interactionsEnabled) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: cardBgColor,
            borderColor: strokeColor,
          },
        ]}
        pointerEvents="box-none"
      >
      <View style={styles.headerRow}>
        {onDelete && (
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: themeColors.error }]}
            onPress={handleDeletePress}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <View
          style={[
            styles.emojiChip,
            iconType
              ? styles.iconChip
              : {
                  backgroundColor: applyOpacity(markColor, ICON_BACKGROUND_ALPHA),
                },
          ]}
        >
          <Animated.View
            style={[
              styles.emojiWrapper,
              iconType && styles.iconWrapper,
              { transform: [{ scale: Animated.multiply(pulseAnim, iconPulseAnim) }] },
            ]}
          >
            {iconType ? (
              <MarkIcon
                type={iconType}
                size={22}
                variant="withBackground"
                animate={iconAnimation}
                ariaLabel={`${mark.name} mark icon`}
                fallbackEmoji={String(mark.emoji || '📊')}
                color={markColor}
              />
            ) : (
              <AppText variant="headline" style={styles.emoji}>
                {String(mark.emoji || '📊')}
              </AppText>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Streak overlay for edit/drag mode */}
      {streak && streak.current > 0 && (
        <View
          style={[
            styles.streakOverlay,
            {
              backgroundColor: applyOpacity(themeColors.accent.secondary, 0.18),
              borderColor: themeColors.accent.secondary,
            },
          ]}
        >
          <View style={styles.streakRow}>
            <Ionicons name="flame-outline" size={13} color={themeColors.textSecondary} />
            <AppText variant="caption" style={[styles.streakText, { color: themeColors.text }]}>
              {String(streak.current)}
            </AppText>
          </View>
        </View>
      )}

      <View style={styles.valueBlock}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <AppText variant="display" style={[styles.value, { color: themeColors.text }]}>
            {String(displayTotal ?? 0)}
          </AppText>
        </Animated.View>
        <AppText
          variant="subtitle"
          numberOfLines={1}
          style={[styles.name, { color: themeColors.text }]}
        >
          {mark.name}
        </AppText>
        {/* Momentum indicator — shows consistency over last 10 days */}
        {momentumScore !== undefined && momentumScore > 0 && (
          <View style={styles.momentumRow}>
            <Ionicons name="pulse-outline" size={13} color={themeColors.textSecondary} />
            <AppText variant="caption" style={[styles.momentumText, { color: themeColors.textSecondary }]}>
              {momentumScore}/10
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.footerRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.decrementButton,
            {
              backgroundColor:
                displayTotal <= 0 ? themeColors.surface : themeColors.error,
              opacity: displayTotal <= 0 ? 0.45 : 1,
            },
          ]}
          onPress={handleDecrementPress}
          disabled={!interactionsEnabled || !onDecrement || displayTotal <= 0}
          activeOpacity={0.85}
        >
          <AppText variant="title" style={styles.actionButtonText}>
            −
          </AppText>
        </TouchableOpacity>

        <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: markColor }]}
            onPressIn={handleIncrementPress}
            disabled={!interactionsEnabled}
            activeOpacity={0.85}
          >
            <AppText variant="title" style={styles.actionButtonText}>
              +
            </AppText>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
    );
  }

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 120 : undefined}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: cardBgColor,
          borderColor: strokeColor,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.headerRow}>
        {onDelete && !interactionsEnabled && (
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: themeColors.error }]}
            onPress={handleDeletePress}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <View
          style={[
            styles.emojiChip,
            iconType
              ? styles.iconChip
              : {
                  backgroundColor: applyOpacity(markColor, ICON_BACKGROUND_ALPHA),
                },
          ]}
        >
          <Animated.View
            style={[
              styles.emojiWrapper,
              iconType && styles.iconWrapper,
              { transform: [{ scale: Animated.multiply(pulseAnim, iconPulseAnim) }] },
            ]}
          >
            {iconType ? (
              <MarkIcon
                type={iconType}
                size={22}
                variant="withBackground"
                animate={iconAnimation}
                ariaLabel={`${mark.name} mark icon`}
                fallbackEmoji={String(mark.emoji || '📊')}
                color={markColor}
              />
            ) : (
              <AppText variant="headline" style={styles.emoji}>
                {String(mark.emoji || '📊')}
              </AppText>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Streak badge overlay (top-right) */}
      {streak && streak.current > 0 && (
        <View
          style={[
            styles.streakOverlay,
            {
              backgroundColor: applyOpacity(themeColors.accent.secondary, 0.18),
              borderColor: themeColors.accent.secondary,
            },
          ]}
        >
          <View style={styles.streakRow}>
            <Ionicons name="flame-outline" size={13} color={themeColors.textSecondary} />
            <AppText variant="caption" style={[styles.streakText, { color: themeColors.text }]}>
              {String(streak.current)}
            </AppText>
          </View>
        </View>
      )}

      <View style={styles.valueBlock}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <AppText variant="display" style={[styles.value, { color: themeColors.text }]}>
            {String(displayTotal ?? 0)}
          </AppText>
        </Animated.View>
        <AppText
          variant="subtitle"
          numberOfLines={1}
          style={[styles.name, { color: themeColors.text }]}
        >
          {mark.name}
        </AppText>
        {/* Momentum indicator — shows consistency over last 10 days */}
        {momentumScore !== undefined && momentumScore > 0 && (
          <View style={styles.momentumRow}>
            <Ionicons name="pulse-outline" size={13} color={themeColors.textSecondary} />
            <AppText variant="caption" style={[styles.momentumText, { color: themeColors.textSecondary }]}>
              {momentumScore}/10
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.footerRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.decrementButton,
            {
              backgroundColor:
                displayTotal <= 0 ? themeColors.surface : themeColors.error,
              opacity: displayTotal <= 0 ? 0.45 : 1,
            },
          ]}
          onPress={handleDecrementPress}
          disabled={!onDecrement || displayTotal <= 0}
          activeOpacity={0.85}
        >
          <AppText variant="title" style={styles.actionButtonText}>
            −
          </AppText>
        </TouchableOpacity>

        <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: markColor, overflow: 'hidden' }]}
            onPress={handleIncrementPress}
            activeOpacity={0.9}
          >
            {/* Section 3 — momentary brightness flash */}
            <Animated.View
              style={[StyleSheet.absoluteFillObject, styles.flashOverlay, { opacity: flashAnim }]}
            />
            <AppText variant="title" style={styles.actionButtonText}>
              +
            </AppText>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.card,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    width: '100%',
    height: TILE_HEIGHT,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 4,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadow.md,
  },
  emojiChip: {
    borderRadius: borderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  iconChip: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    width: 36,
    height: 36,
  },
  emoji: {
    fontSize: 24,
  },
  emojiWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  iconWrapper: {
    marginTop: 0,
  },
  valueBlock: {
    gap: 2,
  },
  value: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: 26,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: 18,
  },
  streakOverlay: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    zIndex: 5,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  momentumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  streakText: {
    fontWeight: fontWeight.medium,
    fontSize: 10,
  },
  momentumText: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    lineHeight: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  actionButton: {
    flex: 1,
    height: 34,
    borderRadius: borderRadius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  decrementButton: {
    marginRight: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    lineHeight: 18,
  },
  flashOverlay: {
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderRadius: borderRadius.sm + 2,
  },
});

// Export as CounterTile for backwards compatibility
// This wrapper accepts 'counter' prop and maps it to 'mark' for MarkTile
// Memoized to prevent unnecessary re-renders when other counters change
export const CounterTile: React.FC<Omit<MarkTileProps, 'mark'> & { counter: Mark }> = React.memo((props) => {
  const { counter, ...rest } = props;
  return <MarkTile mark={counter} {...rest} />;
}, (prevProps, nextProps) => {
  return (
    prevProps.counter.id === nextProps.counter.id &&
    prevProps.counter.total === nextProps.counter.total &&
    prevProps.counter.updated_at === nextProps.counter.updated_at &&
    prevProps.counter.name === nextProps.counter.name &&
    prevProps.counter.color === nextProps.counter.color &&
    prevProps.counter.emoji === nextProps.counter.emoji &&
    prevProps.counter.unit === nextProps.counter.unit &&
    prevProps.counter.dailyTarget === nextProps.counter.dailyTarget &&
    prevProps.streak?.current === nextProps.streak?.current &&
    prevProps.streak?.longest === nextProps.streak?.longest &&
    prevProps.momentumScore === nextProps.momentumScore &&
    prevProps.interactionsEnabled === nextProps.interactionsEnabled &&
    prevProps.iconType === nextProps.iconType &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onIncrement === nextProps.onIncrement &&
    prevProps.onDecrement === nextProps.onDecrement
  );
});

