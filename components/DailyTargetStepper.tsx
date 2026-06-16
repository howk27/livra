import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Minus, Plus } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useEffectiveTheme } from '../state/uiSlice';
import { themedColors } from '../theme/tokens';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { AppText } from './Typography';
import { normalizeDailyTargetInput } from '../lib/markDailyTarget';

const MAX = 99;

interface DailyTargetStepperProps {
  value: number;
  onChange: (next: number) => void;
  label?: string | null;
  helperText?: string | null;
}

export const DailyTargetStepper: React.FC<DailyTargetStepperProps> = ({
  value,
  onChange,
  label = 'Daily target',
  helperText,
}) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const safe = normalizeDailyTargetInput(value);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const resolvedHelperText =
    helperText === undefined ? (safe === 1 ? 'One tap completes today' : 'Taps to complete today') : helperText;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.08, duration: 90, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.72, duration: 70, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
    ]).start();
  }, [safe, scaleAnim, fadeAnim]);

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const dec = () => {
    triggerHaptic();
    onChange(normalizeDailyTargetInput(safe - 1));
  };
  const inc = () => {
    triggerHaptic();
    onChange(normalizeDailyTargetInput(safe + 1));
  };

  return (
    <View style={[styles.row, { borderColor: c.borderMid, backgroundColor: c.surface }]}>
      <TouchableOpacity
        onPress={dec}
        disabled={safe <= 1}
        style={[styles.btn, safe <= 1 && styles.btnDisabled]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Decrease daily target"
      >
        <Minus size={20} color={safe <= 1 ? c.inkMuted : c.inkDark} weight="bold" />
      </TouchableOpacity>
      <View style={styles.mid}>
        {label !== null ? (
          <AppText variant="label" style={{ color: c.inkMid }}>
            {label}
          </AppText>
        ) : null}
        <Animated.View style={[styles.valueWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <AppText style={[styles.value, { color: c.inkDark }]}>{safe}</AppText>
        </Animated.View>
        {resolvedHelperText !== null ? (
          <AppText style={{ fontSize: fontSize.xs, color: c.inkMuted }}>
            {resolvedHelperText}
          </AppText>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={inc}
        disabled={safe >= MAX}
        style={[styles.btn, safe >= MAX && styles.btnDisabled]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Increase daily target"
      >
        <Plus size={20} color={safe >= MAX ? c.inkMuted : c.inkDark} weight="bold" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  mid: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  valueWrap: {
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: fontSize['2xl'],
    lineHeight: 32,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
