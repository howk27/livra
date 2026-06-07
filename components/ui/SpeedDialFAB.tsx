import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AddMarkSheet } from '../sheets/AddMarkSheet';
import { AddGoalSheet } from '../sheets/AddGoalSheet';

const FAB_HINT_KEY = 'fab_hint_shown';
const SPRING = { damping: 18, stiffness: 260, mass: 0.9 };

export function SpeedDialFAB() {
  const theme = useEffectiveTheme();
  const colors = themedColors(theme);
  const insets = useSafeAreaInsets();
  const fabBottom = 64 + insets.bottom + 16;
  const [expanded, setExpanded] = useState(false);
  const [markSheetVisible, setMarkSheetVisible] = useState(false);
  const [goalSheetVisible, setGoalSheetVisible] = useState(false);

  // Animation values
  const rotation = useSharedValue(0);
  const opt1Y = useSharedValue(0);
  const opt1Opacity = useSharedValue(0);
  const opt2Y = useSharedValue(0);
  const opt2Opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const doExpand = useCallback(() => {
    rotation.value = withSpring(1, SPRING);
    opt1Y.value = withSpring(-72, SPRING);
    opt1Opacity.value = withTiming(1, { duration: 160 });
    opt2Y.value = withSpring(-140, SPRING);
    opt2Opacity.value = withDelay(40, withTiming(1, { duration: 200 }));
    backdropOpacity.value = withTiming(1, { duration: 200 });
  }, [rotation, opt1Y, opt1Opacity, opt2Y, opt2Opacity, backdropOpacity]);

  const doCollapse = useCallback(() => {
    rotation.value = withSpring(0, SPRING);
    opt1Y.value = withSpring(0, SPRING);
    opt1Opacity.value = withTiming(0, { duration: 120 });
    opt2Y.value = withSpring(0, SPRING);
    opt2Opacity.value = withTiming(0, { duration: 80 });
    backdropOpacity.value = withTiming(0, { duration: 150 });
  }, [rotation, opt1Y, opt1Opacity, opt2Y, opt2Opacity, backdropOpacity]);

  // First-launch peek hint
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(FAB_HINT_KEY).then(val => {
      if (cancelled || val) return;
      const timer = setTimeout(() => {
        if (cancelled) return;
        // Peek out 40px then retract
        opt1Y.value = withSpring(-40, SPRING);
        opt1Opacity.value = withTiming(0.6, { duration: 200 });
        opt2Y.value = withSpring(-40, SPRING);
        opt2Opacity.value = withTiming(0.4, { duration: 200 });
        setTimeout(() => {
          if (cancelled) return;
          opt1Y.value = withSpring(0, SPRING);
          opt1Opacity.value = withTiming(0, { duration: 300 });
          opt2Y.value = withSpring(0, SPRING);
          opt2Opacity.value = withTiming(0, { duration: 300 });
        }, 600);
        AsyncStorage.setItem(FAB_HINT_KEY, '1');
      }, 500);
      return () => clearTimeout(timer);
    });
    return () => { cancelled = true; };
  }, [opt1Y, opt1Opacity, opt2Y, opt2Opacity]);

  const toggle = useCallback(async () => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (expanded) {
      doCollapse();
      setExpanded(false);
    } else {
      doExpand();
      setExpanded(true);
    }
  }, [expanded, doExpand, doCollapse]);

  const handleAddMark = useCallback(() => {
    doCollapse();
    setExpanded(false);
    setTimeout(() => setMarkSheetVisible(true), 160);
  }, [doCollapse]);

  const handleAddGoal = useCallback(() => {
    doCollapse();
    setExpanded(false);
    setTimeout(() => setGoalSheetVisible(true), 160);
  }, [doCollapse]);

  const fabRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 45}deg` }],
  }));
  const opt1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: opt1Y.value }],
    opacity: opt1Opacity.value,
  }));
  const opt2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: opt2Y.value }],
    opacity: opt2Opacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.2,
  }));

  return (
    <>
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 9000 }]}>
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, { backgroundColor: colors.inkDark }, backdropStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
        </Animated.View>

        {/* Option 1 — New Mark (lower) */}
        <Animated.View
          style={[styles.optionWrap, styles.optionPosition, { bottom: fabBottom }, opt1Style]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <View style={styles.optionRow}>
            <View style={[styles.labelPill, { backgroundColor: colors.surface }]}>
              <Text style={[styles.labelText, { color: colors.inkDark }]}>New Mark</Text>
            </View>
            <TouchableOpacity
              style={[styles.optionBtn, { backgroundColor: colors.forest, shadowColor: colors.forest }]}
              onPress={handleAddMark}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={18} color={colors.inkInverse} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Option 2 — New Goal (upper) */}
        <Animated.View
          style={[styles.optionWrap, styles.optionPosition, { bottom: fabBottom }, opt2Style]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <View style={styles.optionRow}>
            <View style={[styles.labelPill, { backgroundColor: colors.surface }]}>
              <Text style={[styles.labelText, { color: colors.inkDark }]}>New Goal</Text>
            </View>
            <TouchableOpacity
              style={[styles.optionBtn, { backgroundColor: colors.forest, shadowColor: colors.forest }]}
              onPress={handleAddGoal}
              activeOpacity={0.85}
            >
              <Feather name="flag" size={18} color={colors.inkInverse} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Main FAB — hidden when a sheet is open */}
        {!markSheetVisible && !goalSheetVisible && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: colors.forest, bottom: fabBottom }]}
            onPress={toggle}
            activeOpacity={0.9}
          >
            <Animated.View style={fabRotateStyle}>
              <Feather name="plus" size={22} color={colors.inkInverse} />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      <AddMarkSheet visible={markSheetVisible} onClose={() => setMarkSheetVisible(false)} />
      <AddGoalSheet visible={goalSheetVisible} onClose={() => setGoalSheetVisible(false)} />
    </>
  );
}

const FAB_SIZE = 56;
const FAB_BOTTOM = 96;
const FAB_RIGHT = spacing.lg;
const OPT_SIZE = 40;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 8000,
  },
  optionWrap: {
    zIndex: 9001,
  },
  optionPosition: {
    position: 'absolute',
    right: FAB_RIGHT,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  labelPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  labelText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
  },
  optionBtn: {
    width: OPT_SIZE,
    height: OPT_SIZE,
    borderRadius: OPT_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  fab: {
    position: 'absolute',
    right: FAB_RIGHT,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9002,
    ...shadow.fab,
  },
});
