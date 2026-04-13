import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { foregroundForHexBackground } from '@/src/components/icons/color';
import type { GoalPeriod } from '../types';

const PERIOD_OPTIONS: { key: GoalPeriod; label: string }[] = [
  { key: 'day', label: 'Per day' },
  { key: 'week', label: 'Per week' },
  { key: 'month', label: 'Per month' },
];

interface GoalSectionProps {
  goalValue: number | null;
  goalPeriod: GoalPeriod;
  unit: string;
  color: string;
  onChange: (value: number | null, period: GoalPeriod) => void;
}

export const GoalSection: React.FC<GoalSectionProps> = ({
  goalValue, goalPeriod, unit, color, onChange,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const [enabled, setEnabled] = useState(goalValue !== null);
  const [rawText, setRawText] = useState(goalValue ? String(goalValue) : '');

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) {
      onChange(null, goalPeriod);
    } else {
      const v = parseInt(rawText, 10);
      onChange(isNaN(v) || v <= 0 ? null : v, goalPeriod);
    }
  };

  const handleValueChange = (text: string) => {
    setRawText(text);
    const v = parseInt(text, 10);
    onChange(isNaN(v) || v <= 0 ? null : v, goalPeriod);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.toggleRow,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        ]}
        onPress={handleToggle}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Set a goal</Text>
          <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
            Track progress toward a target
          </Text>
        </View>
        <View style={[styles.toggleSwitch, { backgroundColor: enabled ? color : themeColors.border }]}>
          <View style={[styles.toggleThumb, { marginLeft: enabled ? 20 : 2 }]} />
        </View>
      </TouchableOpacity>

      {enabled && (
        <View style={[styles.configBox, { backgroundColor: (themeColors as any).surfaceVariant ?? themeColors.surface }]}>
          <View style={styles.valueRow}>
            <TextInput
              value={rawText}
              onChangeText={handleValueChange}
              keyboardType="numeric"
              placeholder="8"
              placeholderTextColor={themeColors.textSecondary}
              maxLength={4}
              style={[
                styles.valueInput,
                {
                  color: themeColors.text,
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            />
            <Text style={[styles.unitLabel, { color: themeColors.textSecondary }]}>{unit}</Text>
          </View>

          <View style={styles.periodRow}>
            {PERIOD_OPTIONS.map(opt => {
              const active = goalPeriod === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.periodPill,
                    {
                      backgroundColor: active ? color : themeColors.surface,
                      borderColor: active ? color : themeColors.border,
                    },
                  ]}
                  onPress={() => onChange(goalValue, opt.key)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.periodText,
                      {
                        color: active
                          ? foregroundForHexBackground(color, theme === 'dark')
                          : themeColors.textSecondary,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {goalValue && (
            <Text style={[styles.preview, { color: themeColors.textSecondary }]}>
              Goal: {goalValue} {unit}{' '}
              {goalPeriod === 'day' ? 'per day' : goalPeriod === 'week' ? 'per week' : 'per month'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  toggleDesc: { fontSize: 13 },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
  configBox: { padding: 16, borderRadius: 12, gap: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueInput: {
    width: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  unitLabel: { fontSize: 15 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodPill: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  periodText: { fontSize: 13, fontWeight: '500' },
  preview: { fontSize: 12, fontStyle: 'italic' },
});
