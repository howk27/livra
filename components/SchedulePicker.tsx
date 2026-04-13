import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { foregroundForHexBackground } from '@/src/components/icons/color';
import type { ScheduleType, DayOfWeek } from '../types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface SchedulePickerProps {
  scheduleType: ScheduleType;
  scheduleDays: DayOfWeek[];
  color: string;
  onChange: (type: ScheduleType, days: DayOfWeek[]) => void;
}

export const SchedulePicker: React.FC<SchedulePickerProps> = ({
  scheduleType, scheduleDays, color, onChange,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  const handleTypePress = (type: ScheduleType) => {
    if (type === 'daily') {
      onChange('daily', []);
    } else {
      onChange('custom', scheduleDays.length > 0 ? scheduleDays : [1, 2, 3, 4, 5] as DayOfWeek[]);
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    const next = scheduleDays.includes(day)
      ? scheduleDays.filter(d => d !== day)
      : ([...scheduleDays, day].sort((a, b) => a - b) as DayOfWeek[]);
    onChange('custom', next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.typeRow}>
        {([
          { key: 'daily' as ScheduleType, label: 'Every day' },
          { key: 'custom' as ScheduleType, label: 'Specific days' },
        ]).map(opt => {
          const active = scheduleType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.typePill,
                {
                  backgroundColor: active ? color : themeColors.surface,
                  borderColor: active ? color : themeColors.border,
                },
              ]}
              onPress={() => handleTypePress(opt.key)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.typePillText,
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

      {scheduleType === 'custom' && (
        <View style={styles.daysRow}>
          {DAY_LABELS.map((label, idx) => {
            const day = idx as DayOfWeek;
            const active = scheduleDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: active ? color : themeColors.surface,
                    borderColor: active ? color : themeColors.border,
                  },
                ]}
                onPress={() => toggleDay(day)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.dayChipText,
                    {
                      color: active
                        ? foregroundForHexBackground(color, theme === 'dark')
                        : themeColors.textSecondary,
                    },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typePill: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  typePillText: { fontSize: 13, fontWeight: '500' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayChipText: { fontSize: 13, fontWeight: '600' },
});
