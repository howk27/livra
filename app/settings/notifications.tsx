import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useNotificationsMaster } from '../../hooks/useNotificationsMaster';
import { MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE } from '../../lib/notifications/notificationCopy';
import {
  getDailyReminderTime,
  setDailyReminderTime,
  clearDailyReminderTime,
  scheduleDailyReminder,
  cancelDailyReminder,
} from '../../lib/notifications/dailyReminder';
import {
  getWeeklyReviewNotifEnabled,
  setWeeklyReviewNotifEnabled,
  reconcileWeeklyReview,
} from '../../lib/notifications/weeklyReview';
import { useAuth } from '../../hooks/useAuth';
import { queryClient } from '../../lib/data/queryClient';
import { queryKeys } from '../../lib/data/queryKeys';
import type { GoalRow } from '../../lib/data/types';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';

function hhmmToDate(hhmm: string): Date {
  const [h = '8', m = '0'] = hhmm.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  return d;
}

function dateToHhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Scheduling silently fails (or throws) without OS permission — both per-feature
// toggles ask first, through this one door.
async function ensureNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export default function NotificationsScreen() {
  const c = themedColors(useEffectiveTheme());
  const { enabled, hydrated, setEnabled } = useNotificationsMaster();
  const { showError } = useNotification();

  const { user } = useAuth();

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<Date>(() => hhmmToDate('8:00'));
  const [reminderHydrated, setReminderHydrated] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // WR-4: the weekly review row, default ON (a new row — the 2026-06-20 dead
  // Weekly Summary toggle no longer exists in the repo).
  const [weeklyReviewEnabled, setWeeklyReviewEnabledState] = useState(true);
  const [weeklyReviewHydrated, setWeeklyReviewHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    getDailyReminderTime().then((stored) => {
      if (!active) return;
      if (stored) {
        setReminderTime(hhmmToDate(stored));
        setReminderEnabled(true);
      }
      setReminderHydrated(true);
    });
    getWeeklyReviewNotifEnabled().then((v) => {
      if (!active) return;
      setWeeklyReviewEnabledState(v);
      setWeeklyReviewHydrated(true);
    });
    return () => { active = false; };
  }, []);

  const userId = user?.id;

  const handleWeeklyReviewToggle = useCallback(async (value: boolean) => {
    const hasActiveGoals = (): boolean => {
      const goals = userId
        ? (queryClient.getQueryData<GoalRow[]>(queryKeys.goals(userId)) ?? [])
        : [];
      return goals.some((g) => g.status === 'active' && !g.deleted_at);
    };
    setWeeklyReviewEnabledState(value);
    try {
      if (value && !(await ensureNotificationPermission())) {
        setWeeklyReviewEnabledState(false);
        showError('Notifications are off for Livra. Allow them in your phone Settings to get the weekly review.');
        return;
      }
      await setWeeklyReviewNotifEnabled(value);
      await reconcileWeeklyReview(hasActiveGoals());
    } catch (e) {
      logger.error('[Notifications] weekly review toggle failed:', e);
      setWeeklyReviewEnabledState(!value);
      showError('Could not update the weekly review. Please try again.');
    }
  }, [userId, showError]);

  const handleReminderToggle = useCallback(async (value: boolean) => {
    setReminderEnabled(value);
    try {
      if (value) {
        if (!(await ensureNotificationPermission())) {
          setReminderEnabled(false);
          showError('Notifications are off for Livra. Allow them in your phone Settings to get a daily reminder.');
          return;
        }
        setShowTimePicker(true);
        const hhmm = dateToHhmm(reminderTime);
        await setDailyReminderTime(hhmm);
        await scheduleDailyReminder(hhmm);
      } else {
        setShowTimePicker(false);
        await cancelDailyReminder();
        await clearDailyReminderTime();
      }
    } catch (e) {
      logger.error('[Notifications] daily reminder toggle failed:', e);
      setReminderEnabled(!value);
      showError('Could not set the daily reminder. Please try again.');
    }
  }, [reminderTime, showError]);

  const handleReminderTimeChange = useCallback(async (_: unknown, selected?: Date) => {
    if (!selected) return;
    setReminderTime(selected);
    try {
      const hhmm = dateToHhmm(selected);
      await setDailyReminderTime(hhmm);
      await scheduleDailyReminder(hhmm);
    } catch (e) {
      logger.error('[Notifications] daily reminder time change failed:', e);
    }
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Notifications" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: c.inkMid }]}>
          Livra never sends guilt. Only momentum.
        </Text>

        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>{MASTER_NOTIF_LABEL}</Text>
              <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>{MASTER_NOTIF_SUBTITLE}</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              disabled={!hydrated}
              trackColor={{ false: c.borderMid, true: c.forest }}
              thumbColor={c.surface}
            />
          </View>

          <View style={[styles.rowDivider, { backgroundColor: c.borderLight }]} />

          <View style={[styles.toggleRow, !enabled && styles.rowDisabled]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Daily reminder</Text>
              {reminderEnabled ? (
                <TouchableOpacity onPress={() => setShowTimePicker((v) => !v)} disabled={!enabled}>
                  <Text style={[styles.rowSubtitle, { color: c.accent }]}>
                    {reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>
                  One nudge a day, at a time you pick.
                </Text>
              )}
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              disabled={!reminderHydrated || !enabled}
              trackColor={{ false: c.borderMid, true: c.forest }}
              thumbColor={c.surface}
            />
          </View>

          {enabled && reminderEnabled && showTimePicker && (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={reminderTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleReminderTimeChange}
              />
            </View>
          )}

          <View style={[styles.rowDivider, { backgroundColor: c.borderLight }]} />

          <View style={[styles.toggleRow, !enabled && styles.rowDisabled]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Weekly review</Text>
              <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>
                Sunday evening, your week reflected back.
              </Text>
            </View>
            <Switch
              value={weeklyReviewEnabled}
              onValueChange={handleWeeklyReviewToggle}
              disabled={!weeklyReviewHydrated || !enabled}
              trackColor={{ false: c.borderMid, true: c.forest }}
              thumbColor={c.surface}
            />
          </View>
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
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowDivider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  rowSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  pickerWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
