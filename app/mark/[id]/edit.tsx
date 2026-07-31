import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
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
// M9 Phase 5A Task 6: the mark is read from the query layer and edited through
// the marks mutation — this screen no longer touches the retired store. The
// schedule / goal_value section is GONE with it: those fields lived only in the
// local database this milestone deletes (no server column, never carried by
// mark/new since Phase 3), so a picker that "saved" them was writing to
// nothing. Weekly cadence is the frequency/weekly_target family, edited via
// the Pace setting and the frequency pickers.
import { useMark } from '@/lib/data/marks';
import { useEditMarkMutation } from '@/lib/data/mutations/marks';
import { useAuth } from '../../../hooks/useAuth';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';
import type { MarkType } from '@/src/types/counters';
import { logger } from '../../../lib/utils/logger';
import { DailyTargetStepper } from '../../../components/DailyTargetStepper';
import { resolveDailyTarget } from '../../../lib/markDailyTarget';
import { getIconAccent } from '../../../lib/markCategory';
import { ICON_TYPE_TO_EMOJI, MARK_ICON_OPTIONS } from '../../../lib/markIcons';
import { useNotification } from '../../../contexts/NotificationContext';

// VD-7 retry #1: the icon emoji map + selectable list live in lib/markIcons.ts,
// shared with mark/new.tsx so the two grids can never diverge.
const ALL_ICON_TYPES = MARK_ICON_OPTIONS;

export default function EditCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);
  const router = useRouter();
  const { showError } = useNotification();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const markQuery = useMark(id ?? '');
  const counter = markQuery.data ?? null;
  const editMark = useEditMarkMutation(user?.id ?? '');

  // Get current icon type from counter or resolve from emoji/name
  const currentIconType = useMemo((): Exclude<MarkType, 'custom'> => {
    if (counter) {
      const resolved = resolveCounterIconType({
        name: counter.name,
        emoji: counter.emoji ?? undefined,
      });
      return (resolved || 'gym') as Exclude<MarkType, 'custom'>; // Default to gym if can't resolve
    }
    return 'gym';
  }, [counter]);

  const [name, setName] = useState(counter?.name || '');
  const [selectedIconType, setSelectedIconType] = useState<Exclude<MarkType, 'custom'>>(currentIconType);

  // Entering from mark detail the row is a cache hit, but on a cold open the
  // query resolves a beat later — sync the form fields when it lands.
  useEffect(() => {
    if (counter) {
      setName((prev) => (prev === '' ? counter.name : prev));
      const resolved = resolveCounterIconType({
        name: counter.name,
        emoji: counter.emoji ?? undefined,
      });
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
  const [dailyTarget, setDailyTarget] = useState(() => (counter ? resolveDailyTarget(counter) : 1));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (counter) {
      setDailyTarget(resolveDailyTarget(counter));
      setUnit((counter.unit as 'sessions' | 'days' | 'items') || 'sessions');
    }
  }, [counter]);

  if (markQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.linen }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={themeColors.inkMuted} />
        </View>
      </SafeAreaView>
    );
  }

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
      showError('Please enter a counter name');
      return;
    }

    try {
      setLoading(true);
      // Convert selected icon type to emoji for storage compatibility
      const emoji = ICON_TYPE_TO_EMOJI[selectedIconType] || ICON_TYPE_TO_EMOJI.gym;
      await editMark.mutateAsync({
        markId: id,
        changes: {
          name: name.trim(),
          emoji,
          color,
          unit,
          cadence: { dailyTarget },
        },
      });
      router.back();
    } catch (error) {
      logger.error('Error updating counter:', error);
      showError('Failed to update counter. Please try again.');
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
});
