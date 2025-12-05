import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useCounters } from '../../../hooks/useCounters';

const EMOJI_OPTIONS = ['🏋️', '📖', '🧘', '💧', '📚', '🎯', '🏃', '🍎', '💪', '📱', '🎨', '🚀'];
const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#EF4444', '#EC4899'];
const UNIT_OPTIONS = ['sessions', 'days', 'items'];

export default function EditCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, updateCounter } = useCounters();
  const counter = id ? counters.find((c) => c.id === id) : null;

  const [name, setName] = useState(counter?.name || '');
  const [emoji, setEmoji] = useState(counter?.emoji || EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(counter?.color || COLOR_OPTIONS[0]);
  const [unit, setUnit] = useState<'sessions' | 'days' | 'items'>(
    (counter?.unit as 'sessions' | 'days' | 'items') || 'sessions'
  );
  const [enableStreak, setEnableStreak] = useState(counter?.enable_streak ?? true);
  const [loading, setLoading] = useState(false);

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
      await updateCounter(id, {
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
      });
      router.back();
    } catch (error) {
      console.error('Error updating counter:', error);
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
            <Text style={[styles.saveButton, { color: themeColors.primary }]}>Save</Text>
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

        {/* Emoji Picker */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Emoji</Text>
          <View style={styles.emojiGrid}>
            {EMOJI_OPTIONS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[
                  styles.emojiButton,
                  {
                    backgroundColor: e === emoji ? color + '30' : themeColors.surface,
                    borderColor: e === emoji ? color : themeColors.border,
                  },
                ]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
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

        {/* Unit Selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Unit</Text>
          <View style={styles.unitButtons}>
            {UNIT_OPTIONS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.unitButton,
                  {
                    backgroundColor: u === unit ? color : themeColors.surface,
                    borderColor: u === unit ? color : themeColors.border,
                  },
                ]}
                onPress={() => setUnit(u as 'sessions' | 'days' | 'items')}
              >
                <Text
                  style={[styles.unitButtonText, { color: u === unit ? '#FFFFFF' : themeColors.text }]}
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
              <View style={styles.toggleThumb} />
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
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emojiButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  emojiText: {
    fontSize: 24,
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
    backgroundColor: '#FFFFFF',
  },
});

