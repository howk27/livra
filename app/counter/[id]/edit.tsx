import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useCounters } from '../../../hooks/useCounters';
import { SchedulePicker } from '../../../components/SchedulePicker';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../../types';
import { parseScheduleDays } from '../../../lib/features';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import type { MarkType } from '@/src/types/counters';
import { logger } from '../../../lib/utils/logger';
import { DailyTargetStepper } from '../../../components/DailyTargetStepper';
import { resolveDailyTarget } from '../../../lib/markDailyTarget';

const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#EF4444', '#EC4899'];

// Mapping of icon types to emojis for storage compatibility
const ICON_TYPE_TO_EMOJI: Record<Exclude<MarkType, 'custom'>, string> = {
  email: '📧',
  planning: '🗓️',
  focus: '🎯',
  tasks: '✅',
  language: '🗣️',
  study: '📚',
  reading: '📖',
  calories: '🔥',
  soda_free: '🥤',
  rest: '🛌',
  meditation: '🧘',
  sleep: '🌙',
  gym: '🏋️',
  steps: '👣',
  water: '💧',
  no_sugar: '🚫',
  no_beer: '🍺',
  no_spending: '💰',
  mood: '😊',
  no_smoking: '🚭',
  screen_free: '📱',
  gratitude: '🙏',
  journaling: '📝',
};

// All available icon types (excluding 'custom' as it has no icon)
const ALL_ICON_TYPES: Exclude<MarkType, 'custom'>[] = [
  'email',
  'planning',
  'focus',
  'tasks',
  'language',
  'study',
  'reading',
  'calories',
  'soda_free',
  'rest',
  'meditation',
  'sleep',
  'gym',
  'steps',
  'water',
  'no_sugar',
  'no_beer',
  'no_spending',
  'mood',
  'no_smoking',
  'screen_free',
  'gratitude',
  'journaling',
];

export default function EditCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
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
  const [color, setColor] = useState(counter?.color || COLOR_OPTIONS[0]);
  const [unit, setUnit] = useState<'sessions' | 'days' | 'items'>(
    (counter?.unit as 'sessions' | 'days' | 'items') || 'sessions'
  );
  const [enableStreak, setEnableStreak] = useState(counter?.enable_streak ?? true);
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
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: themeColors.text }]}>Counter not found</Text>
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
        enable_streak: enableStreak,
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
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.cancelButton, { color: themeColors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Edit Mark</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[styles.saveButton, { color: themeColors.accent.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        {/* Name Field */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.text }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Gym Sessions"
            placeholderTextColor={themeColors.textTertiary}
          />
        </View>

        {/* Icon Picker */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Icon</Text>
          <View style={styles.iconGrid}>
            {ALL_ICON_TYPES.map((iconType) => {
              const isSelected = iconType === selectedIconType;
              return (
                <TouchableOpacity
                  key={iconType}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: isSelected ? color + '30' : themeColors.surface,
                      borderColor: isSelected ? color : themeColors.border,
                    },
                  ]}
                  onPress={() => setSelectedIconType(iconType)}
                >
                  <CounterIcon
                    type={iconType as any}
                    size={28}
                    color={isSelected ? color : themeColors.textSecondary}
                    variant="symbol"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Color</Text>
          <View style={styles.colorGrid}>
            {COLOR_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorButton,
                  {
                    backgroundColor: c,
                    borderWidth: c === color ? 3 : 0,
                    borderColor: themeColors.background,
                  },
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <DailyTargetStepper value={dailyTarget} onChange={setDailyTarget} />
        </View>
        {/* Schedule */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Schedule</Text>
          <SchedulePicker
            scheduleType={scheduleType}
            scheduleDays={scheduleDays}
            color={color}
            onChange={(t, d) => { setScheduleType(t); setScheduleDays(d); }}
          />
        </View>
        {/* Enable Streak Toggle */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.toggleRow, { backgroundColor: themeColors.surface }]}
            onPress={() => setEnableStreak(!enableStreak)}
          >
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Enable Streak</Text>
              <Text style={[styles.toggleDescription, { color: themeColors.textSecondary }]}>
                Track consecutive days with activity
              </Text>
            </View>
            <View
              style={[
                styles.toggleSwitch,
                {
                  backgroundColor: enableStreak ? color : themeColors.border,
                  alignItems: enableStreak ? 'flex-end' : 'flex-start',
                },
              ]}
            >
              <View style={[styles.toggleThumb, { backgroundColor: themeColors.surface }]} />
            </View>
          </TouchableOpacity>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.full,
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

