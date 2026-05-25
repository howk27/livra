import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useCheckinsStore } from '../state/checkinsSlice';

export function CheckinButton() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const hasCheckedInToday = useCheckinsStore(s => s.hasCheckedInToday);

  const activeGoal = goals.find(g => g.status === 'active');
  if (!activeGoal) return null;

  const done = hasCheckedInToday(activeGoal.id);

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          backgroundColor: done ? themeColors.surface : themeColors.primary,
          borderColor: done ? themeColors.border : themeColors.primary,
        },
      ]}
      onPress={() => router.push('/checkin')}
      activeOpacity={0.8}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'radio-button-off'}
        size={18}
        color={done ? themeColors.textSecondary : '#FFFFFF'}
      />
      <Text style={[styles.btnText, { color: done ? themeColors.textSecondary : '#FFFFFF' }]}>
        {done ? 'Checked in today' : 'Check in'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  btnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
