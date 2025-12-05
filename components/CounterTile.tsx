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

const TILE_HEIGHT = 260;

interface MarkTileProps {
  mark: Mark;
  streak?: { current: number; longest: number };
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
  const iconPulseAnim = useRef(new Animated.Value(1)).current; // Separate animation for immediate icon feedback
  const markColor = mark.color || themeColors.primary;
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

  // Animate on increment - Success bump per design spec (140-180ms)
  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    if (displayTotal > 0) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: motion.quick,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: motion.quick,
          useNativeDriver: true,
          easing: (t) => t * (2 - t), // cubic-bezier(0.2, 0.8, 0.2, 1) equivalent
        }),
      ]);
      pulse.start();
    }
  }, [displayTotal, prefersReducedMotion, pulseAnim]);

  const handleIncrementPress = () => {
    if (!interactionsEnabled) return;
    
    // IMMEDIATE VISUAL FEEDBACK: Start pulsing animation instantly (before any state updates)
    // This gives instant feedback even if state update is delayed
    if (!prefersReducedMotion) {
      // Start pulsing animation immediately
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 3 } // Pulse 3 times
      ).start(() => {
        // Reset to normal after pulsing
        pulseAnim.setValue(1.0);
      });
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
    
    // IMMEDIATE VISUAL FEEDBACK: Start pulsing animation instantly (before any state updates)
    if (!prefersReducedMotion) {
      // Start pulsing animation immediately on icon (separate from value pulse)
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconPulseAnim, {
            toValue: 0.85,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(iconPulseAnim, {
            toValue: 1.0,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 } // Pulse 2 times for decrement
      ).start(() => {
        // Reset to normal after pulsing
        iconPulseAnim.setValue(1.0);
      });
    }
    
    // INSTANT OPTIMISTIC UPDATE: Update local state immediately (bypasses store)
    const newTotal = Math.max(0, displayTotal - 1);
    optimisticTotalRef.current = newTotal;
    setOptimisticTotal(newTotal);
    
    // CRITICAL: Call decrement for store sync (happens in background, non-blocking)
    onDecrement();
    
    // Haptic feedback per design spec
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Animate button press
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


  // Use bg.surface per spec
  const cardBgColor = themeColors.surface;
  
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
                size={28}
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
        {streak && streak.current > 0 ? (
          <View
            style={[
              styles.streakBadge,
              {
                borderColor: themeColors.accent.secondary,
                backgroundColor: applyOpacity(themeColors.accent.secondary, 0.2),
              },
            ]}
          >
            <AppText variant="caption" style={[styles.streakText, { color: themeColors.text }]}>
              🔥 {String(streak.current)} day{streak.current === 1 ? '' : 's'}
            </AppText>
          </View>
        ) : null}
      </View>

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
        <AppText variant="label" style={[styles.unit, { color: themeColors.textSecondary }]}>
          {String(mark.unit ?? '')}
        </AppText>
      </View>

      <View style={styles.footerRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.decrementButton,
            shadow.sm,
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
            style={[styles.actionButton, { backgroundColor: markColor }, shadow.sm]}
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
                size={28}
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
        {streak && streak.current > 0 ? (
          <View
            style={[
              styles.streakBadge,
              {
                borderColor: themeColors.accent.secondary,
                backgroundColor: applyOpacity(themeColors.accent.secondary, 0.2),
              },
            ]}
          >
            <AppText variant="caption" style={[styles.streakText, { color: themeColors.text }]}>
              🔥 {String(streak.current)} day{streak.current === 1 ? '' : 's'}
            </AppText>
          </View>
        ) : null}
      </View>

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
        <AppText variant="label" style={[styles.unit, { color: themeColors.textSecondary }]}>
          {String(mark.unit ?? '')}
        </AppText>
      </View>

      <View style={styles.footerRow}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.decrementButton,
            shadow.sm,
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
            style={[styles.actionButton, { backgroundColor: markColor }, shadow.sm]}
            onPress={handleIncrementPress}
            activeOpacity={0.85}
          >
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
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    width: '100%',
    height: TILE_HEIGHT,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: spacing.lg,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  deleteButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadow.md,
  },
  emojiChip: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  iconChip: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    width: 44,
    height: 44,
  },
  emoji: {
    fontSize: 32,
  },
  emojiWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  iconWrapper: {
    marginTop: 0,
  },
  valueBlock: {
    gap: spacing.xs,
  },
  value: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  name: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  unit: {
    letterSpacing: 1,
  },
  streakBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  streakText: {
    fontWeight: fontWeight.medium,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decrementButton: {
    marginRight: spacing.xs,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
});

// Export as CounterTile for backwards compatibility
// This wrapper accepts 'counter' prop and maps it to 'mark' for MarkTile
// Memoized to prevent unnecessary re-renders when other counters change
export const CounterTile: React.FC<Omit<MarkTileProps, 'mark'> & { counter: Mark }> = React.memo((props) => {
  const { counter, ...rest } = props;
  return <MarkTile mark={counter} {...rest} />;
}, (prevProps, nextProps) => {
  // Return true if props are equal (skip re-render), false if different (re-render)
  return (
    prevProps.counter.id === nextProps.counter.id &&
    prevProps.counter.total === nextProps.counter.total &&
    prevProps.counter.updated_at === nextProps.counter.updated_at &&
    prevProps.counter.name === nextProps.counter.name &&
    prevProps.counter.color === nextProps.counter.color &&
    prevProps.counter.emoji === nextProps.counter.emoji &&
    prevProps.streak?.current === nextProps.streak?.current &&
    prevProps.streak?.longest === nextProps.streak?.longest &&
    prevProps.interactionsEnabled === nextProps.interactionsEnabled &&
    prevProps.iconType === nextProps.iconType &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.onIncrement === nextProps.onIncrement &&
    prevProps.onDecrement === nextProps.onDecrement
  );
});

