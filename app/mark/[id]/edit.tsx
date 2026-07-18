import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  themedColors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  headerControl,
  headerControlBoxLeading,
  headerControlBoxTrailing,
} from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useCounters } from '../../../hooks/useCounters';
import { SchedulePicker } from '../../../components/SchedulePicker';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../../types';
import { parseScheduleDays } from '../../../lib/features';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';
import type { MarkType } from '@/src/types/counters';
import { logger } from '../../../lib/utils/logger';
import { DailyTargetStepper } from '../../../components/DailyTargetStepper';
import { resolveDailyTarget } from '../../../lib/markDailyTarget';
import { getIconAccent } from '../../../lib/markCategory';
import { ICON_TYPE_TO_EMOJI, MARK_ICON_OPTIONS } from '../../../lib/markIcons';

// VD-7 retry #1: the icon emoji map + selectable list live in lib/markIcons.ts,
// shared with mark/new.tsx so the two grids can never diverge.
const ALL_ICON_TYPES = MARK_ICON_OPTIONS;

export default function EditCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, updateCounter } = useCounters();
  const counter = id ? counters.find((c) => c.id === id) : null;

  // Get current icon type from counter or resolve from emoji/name
  const currentIconType = useMemo((): Exclude<MarkType, 'custom'> => {
    if (counter) {
      const resolved = resolveCounterIconType({ name: counter.name, emoji: counter.emoji });
      return (resolved || 'gym') as Exclude<MarkType, 'custom'>; // Default to gym if can't resolve
    }
    return 'gym';
  }, [counter]);

  const [name, setName] = useState(counter?.name || '');
  const [selectedIconType, setSelectedIconType] = useState<Exclude<MarkType, 'custom'>>(currentIconType);

  // Sync icon type when counter changes
  useEffect(() => {
    if (counter) {
      const resolved = resolveCounterIconType({ name: counter.name, emoji: counter.emoji });
      if (resolved && resolved !== 'custom') {
        setSelectedIconType(resolved as Exclude<MarkType, 'custom'>);
      }
    }
  }, [counter]);
  // Batch 2 (founder 2026-07-18): color is the ICON's own accent, same rule as
  // mark/new.tsx — unique per icon so a goal's marks stay tellable apart. A
  // stored color is preserved untouched unless the user changes the icon;
  // changing the icon re-derives from the new icon's accent.
  const color =
    selectedIconType !== currentIconType
      ? getIconAccent(selectedIconType)
      : counter?.color || getIconAccent(selectedIconType);
  const [unit, setUnit] = useState<'sessions' | 'days' | 'items'>(
    (counter?.unit as 'sessions' | 'days' | 'items') || 'sessions'
  );
  const [goalValue, setGoalValue] = useState<number | null>(counter?.goal_value ?? null);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>((counter?.goal_period as GoalPeriod) ?? 'day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>((counter?.schedule_type as ScheduleType) ?? 'daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>(counter ? parseScheduleDays(counter) : []);
  const [dailyTarget, setDailyTarget] = useState(() => (counter ? resolveDailyTarget(counter) : 1));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (counter) setDailyTarget(resolveDailyTarget(counter));
  }, [counter]);

  if (!counter || !id) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.linen }]}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: themeColors.inkDark }]}>Counter not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a counter name');
      return;
    }

    try {
      setLoading(true);
      // Convert selected icon type to emoji for storage compatibility
      const emoji = ICON_TYPE_TO_EMOJI[selectedIconType] || ICON_TYPE_TO_EMOJI.gym;
      await updateCounter(id, {
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: counter?.enable_streak ?? false,
        dailyTarget,
        goal_value: goalValue,
        goal_period: goalPeriod,
        schedule_type: scheduleType,
        schedule_days: scheduleType === 'custom' ? JSON.stringify(scheduleDays) : undefined,
      } as any);
      router.back();
    } catch (error) {
      logger.error('Error updating counter:', error);
      Alert.alert('Error', 'Failed to update counter. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.linen }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Text style={[styles.cancelButton, { color: themeColors.inkMid }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.inkDark }]}>Edit Mark</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading} style={styles.headerBtnRight}>
            <Text style={[styles.saveButton, { color: themeColors.accent }]}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Name Field */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.inkDark }]}>Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.inkDark }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Gym Sessions"
            placeholderTextColor={themeColors.inkMuted}
          />
        </View>

        {/* Icon Picker */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.label, styles.labelInRow, { color: themeColors.inkDark }]}>Icon</Text>
          </View>
          {/* Batch 2: same per-icon accents as mark/new — each tile shows its
              own hue; no category kicker to print. */}
          <View style={styles.iconGrid}>
            {ALL_ICON_TYPES.map((iconType) => {
              const isSelected = iconType === selectedIconType;
              const accent = getIconAccent(iconType);
              return (
                <TouchableOpacity
                  key={iconType}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: applyOpacity(accent, isSelected ? 0.18 : 0.08),
                      borderColor: isSelected ? accent : themeColors.borderMid,
                    },
                  ]}
                  onPress={() => setSelectedIconType(iconType)}
                >
                  <CounterIcon
                    type={iconType as any}
                    size={28}
                    color={accent}
                    variant="symbol"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <DailyTargetStepper value={dailyTarget} onChange={setDailyTarget} />
        </View>

        {/* Schedule */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.inkDark }]}>Schedule</Text>
          <SchedulePicker
            scheduleType={scheduleType}
            scheduleDays={scheduleDays}
            color={color}
            onChange={(t, d) => { setScheduleType(t); setScheduleDays(d); }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: fontSize.lg,
  },
  content: {
    padding: spacing.lg,
    // QC4-K: converge the header's distance below the safe-area inset onto the
    // shared headerControl.topGap (was the spacing.lg page padding, 24).
    paddingTop: headerControl.topGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  // QC4-K: Cancel/Save were bare Texts with no touch box at all.
  headerBtn: { ...headerControlBoxLeading },
  headerBtnRight: { ...headerControlBoxTrailing },
  cancelButton: {
    fontSize: fontSize.base,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  saveButton: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  labelInRow: {
    marginBottom: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionKickerRight: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  unitButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 2,
  },
  unitButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textTransform: 'capitalize',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontSize: fontSize.sm,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
});
