import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface ToggleRowProps {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  subRow?: React.ReactNode;
  subRowVisible?: boolean;
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
  isLast,
  subRow,
  subRowVisible,
}: ToggleRowProps) {
  const c = themedColors(useEffectiveTheme());
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (subRowVisible) {
      height.value = withTiming(56, { duration: 250 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      height.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [subRowVisible, height, opacity]);

  const subRowStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  return (
    <View style={[styles.rowWrap, !isLast && [styles.rowBorder, { borderBottomColor: c.borderLight }]]}>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: c.inkDark }]}>{label}</Text>
          <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>{subtitle}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: c.borderMid, true: c.forest }}
          thumbColor={c.surface}
        />
      </View>
      {subRow && (
        <Animated.View style={subRowStyle}>
          {subRow}
        </Animated.View>
      )}
    </View>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function NotificationsScreen() {
  const c = themedColors(useEffectiveTheme());
  const [dailyReminder, setDailyReminder] = useState(true);
  const [goalProgress, setGoalProgress] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);
  const [markReminders, setMarkReminders] = useState(false);
  const [summaryDay, setSummaryDay] = useState(0);

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Notifications" />
      <ScrollView contentContainerStyle={styles.content}>

        <Text style={[styles.intro, { color: c.inkMid }]}>
          Livra never sends guilt. Only momentum.
        </Text>

        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <ToggleRow
            label="Daily Reminder"
            subtitle="A nudge to log your marks"
            value={dailyReminder}
            onToggle={setDailyReminder}
            subRowVisible={dailyReminder}
            subRow={
              <View style={styles.subRow}>
                <Text style={[styles.subRowLabel, { color: c.inkMid }]}>Reminder time — set per-mark in mark detail</Text>
              </View>
            }
          />
          <ToggleRow
            label="Goal Progress Updates"
            subtitle="When you hit a milestone toward a goal"
            value={goalProgress}
            onToggle={setGoalProgress}
          />
          <ToggleRow
            label="Weekly Summary"
            subtitle="Every Sunday — your week in review"
            value={weeklySummary}
            onToggle={setWeeklySummary}
            subRowVisible={weeklySummary}
            subRow={
              <View style={styles.subRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}
                >
                  {DAYS.map((day, i) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayPill,
                        { backgroundColor: summaryDay === i ? c.forest : c.surfaceAlt },
                      ]}
                      onPress={() => setSummaryDay(i)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayPillText,
                          { color: summaryDay === i ? c.inkInverse : c.inkMid },
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            }
          />
          <ToggleRow
            label="Mark Reminders"
            subtitle="Per-mark custom reminders"
            value={markReminders}
            onToggle={setMarkReminders}
            isLast
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  rowWrap: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  rowSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  subRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    justifyContent: 'center',
  },
  subRowLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  dayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    minWidth: 44,
    alignItems: 'center',
  },
  dayPillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
});
