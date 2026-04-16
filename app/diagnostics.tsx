import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../components/Typography';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize } from '../theme/tokens';
import { env } from '../lib/env';
import { useDevTools } from '../providers/DevToolsProvider';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useAuth } from '../hooks/useAuth';
import {
  FeatureFlag,
  getDefaultFlags,
  getFlagOverride,
  resetFlagOverrides,
} from '../lib/experiments/flags';
import { seedDemoData } from '../lib/dev/seedDemoData';
import { resetApp } from '../lib/dev/resetApp';
import { seedBrokenStreak, seedHighUsage, seedPerfectWeek } from '../lib/db/devTools';
import { unlockDashboard } from '../lib/debug/dashboardUnlock';
import { seedWeeklyReviewDemo, type WeeklyReviewSeedScenario } from '../lib/dev/seedWeeklyReviewDemo';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDatabase, query } from '../lib/db';
import { getWeekRange, getWeeklyReview } from '../lib/review/weeklyReview';
import { logger } from '../lib/utils/logger';
import { getAppDate } from '../lib/appDate';
import { formatDate } from '../lib/date';
import { useAppDateStore } from '../state/appDateSlice';
import { readSyncDiagSnapshot, type SyncDiagSnapshotV1 } from '../lib/sync/syncDiagSnapshot';

export default function DiagnosticsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { diagnosticsUnlocked } = useDevTools();
  /** Mock/seed/feature-flag tooling — development builds only (production uses gesture unlock for read-only diagnostics). */
  const showDevInjectionUI = env.isDev;
  const queryClient = useQueryClient();
  const [devStatus, setDevStatus] = useState<{
    localDate: string;
    weekStart: string;
    weekEnd: string;
    windowEvents: number;
    windowDates: string[];
    lastSeedAction: string | null;
    seedUserId: string | null;
  } | null>(null);
  const { user } = useAuth();
  const [syncDiagSnapshot, setSyncDiagSnapshot] = useState<SyncDiagSnapshotV1 | null>(null);
  const refreshSyncDiagSnapshot = useCallback(async () => {
    setSyncDiagSnapshot(await readSyncDiagSnapshot());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSyncDiagSnapshot();
    }, [refreshSyncDiagSnapshot]),
  );

  const [resetBeforeWeeklySeed, setResetBeforeWeeklySeed] = useState(false);
  const debugDateOverride = useAppDateStore((s) => s.debugDateOverride);
  const setDebugDateOverride = useAppDateStore((s) => s.setDebugDateOverride);
  const shiftDebugDateByDays = useAppDateStore((s) => s.shiftDebugDateByDays);
  const useRealDate = useAppDateStore((s) => s.useRealDate);
  const [manualSimDate, setManualSimDate] = useState('');
  const [totalMismatchSummary, setTotalMismatchSummary] = useState<{
    count: number;
    sampleIds: string[];
  } | null>(null);

  const loadDevStatus = async () => {
    await initDatabase();
    const now = getAppDate();
    const localDate = now.toISOString().split('T')[0];
    const { weekStart, weekEnd } = getWeekRange(now);
    const params: any[] = [weekStart, weekEnd];
    const userFilter = user?.id ? 'AND user_id = ?' : '';
    if (user?.id) params.push(user.id);
    const allEvents = await query<{ occurred_local_date: string; user_id: string; event_type: string }>(
      `SELECT occurred_local_date, user_id, event_type
       FROM lc_events
       WHERE deleted_at IS NULL`
    );
    const windowDates = (allEvents || [])
      .filter((event) => event.event_type === 'increment')
      .filter((event) => {
        if (user?.id && event.user_id !== user.id) return false;
        return event.occurred_local_date >= weekStart && event.occurred_local_date <= weekEnd;
      })
      .map((event) => event.occurred_local_date);
    const uniqueDates = Array.from(new Set(windowDates)).sort();
    const lastSeedAction = await AsyncStorage.getItem('livra_last_seed_action');
    const seedUserId = await AsyncStorage.getItem('livra_weekly_review_seed_user_id');
    setDevStatus({
      localDate,
      weekStart,
      weekEnd,
      windowEvents: windowDates.length,
      windowDates: uniqueDates,
      lastSeedAction,
      seedUserId,
    });

    if (user?.id) {
      const { scanMarkTotalMismatchesForUser } = await import('../lib/db/markTotalReconciliation');
      const mismatches = await scanMarkTotalMismatchesForUser(user.id);
      setTotalMismatchSummary({
        count: mismatches.length,
        sampleIds: mismatches.slice(0, 3).map((m) => m.markId),
      });
    } else {
      setTotalMismatchSummary(null);
    }
  };

  const [weeklyReview, setWeeklyReview] = useFeatureFlag('weeklyReview');
  const [personalRecords, setPersonalRecords] = useFeatureFlag('personalRecords');
  const [streakProtection, setStreakProtection] = useFeatureFlag('streakProtection');
  const [smartInsights, setSmartInsights] = useFeatureFlag('smartInsights');
  const [enhancedCelebrations, setEnhancedCelebrations] = useFeatureFlag('enhancedCelebrations');

  useEffect(() => {
    if (!env.isDev && !diagnosticsUnlocked) {
      router.back();
    }
  }, [diagnosticsUnlocked, router]);

  const defaultFlags = useMemo(() => getDefaultFlags(), []);

  const flagRows: Array<{
    key: FeatureFlag;
    label: string;
    value: boolean;
    onChange: (next: boolean) => void;
  }> = [
    { key: 'weeklyReview', label: 'Weekly Review', value: weeklyReview, onChange: setWeeklyReview },
    { key: 'personalRecords', label: 'Personal Records', value: personalRecords, onChange: setPersonalRecords },
    { key: 'streakProtection', label: 'Streak Protection', value: streakProtection, onChange: setStreakProtection },
    { key: 'smartInsights', label: 'Smart Insights', value: smartInsights, onChange: setSmartInsights },
    { key: 'enhancedCelebrations', label: 'Enhanced Celebrations', value: enhancedCelebrations, onChange: setEnhancedCelebrations },
  ];

  const handleSeedDemo = async () => {
    try {
      const result = await seedDemoData({ userId: user?.id });
      logger.log('[Diagnostics] Seed demo data', { counters: result.counters.length });
      Alert.alert('Seeded Demo', `Created ${result.counters.length} counters.`);
      await AsyncStorage.setItem('livra_last_seed_action', 'seedDemoData');
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      const review = await getWeeklyReview(getAppDate(), user?.id);
      logger.log('[Diagnostics] Weekly review summary after seedDemoData', {
        totalActivity: review.totalActivity,
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
      });
      await loadDevStatus();
    } catch (error: any) {
      Alert.alert('Seed Failed', error?.message || 'Unable to seed demo data.');
    }
  };

  const handleSeedHighUsage = async () => {
    try {
      await seedHighUsage(user?.id);
      logger.log('[Diagnostics] Seed high usage');
      Alert.alert('Seeded', 'High usage scenario created.');
      await AsyncStorage.setItem('livra_last_seed_action', 'seedHighUsage');
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      const review = await getWeeklyReview(getAppDate(), user?.id);
      logger.log('[Diagnostics] Weekly review summary after seedHighUsage', {
        totalActivity: review.totalActivity,
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
      });
      await loadDevStatus();
    } catch (error: any) {
      Alert.alert('Seed Failed', error?.message || 'Unable to seed high usage.');
    }
  };

  const handleBrokenStreak = async () => {
    try {
      await seedBrokenStreak(user?.id);
      logger.log('[Diagnostics] Seed broken streak');
      Alert.alert('Simulated', 'Broken streak scenario created.');
      await AsyncStorage.setItem('livra_last_seed_action', 'seedBrokenStreak');
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      const review = await getWeeklyReview(getAppDate(), user?.id);
      logger.log('[Diagnostics] Weekly review summary after seedBrokenStreak', {
        totalActivity: review.totalActivity,
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
      });
      await loadDevStatus();
    } catch (error: any) {
      Alert.alert('Simulation Failed', error?.message || 'Unable to simulate streak loss.');
    }
  };

  const handlePerfectWeek = async () => {
    try {
      await seedPerfectWeek(user?.id);
      logger.log('[Diagnostics] Seed perfect week');
      Alert.alert('Simulated', 'Perfect week scenario created.');
      await AsyncStorage.setItem('livra_last_seed_action', 'seedPerfectWeek');
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      const review = await getWeeklyReview(getAppDate(), user?.id);
      logger.log('[Diagnostics] Weekly review summary after seedPerfectWeek', {
        totalActivity: review.totalActivity,
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
      });
      await loadDevStatus();
    } catch (error: any) {
      Alert.alert('Simulation Failed', error?.message || 'Unable to simulate perfect week.');
    }
  };

  const handleResetApp = async () => {
    try {
      await resetApp();
      Alert.alert('Reset Complete', 'Local app data cleared.');
      await AsyncStorage.setItem('livra_last_seed_action', 'resetApp');
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      await loadDevStatus();
    } catch (error: any) {
      Alert.alert('Reset Failed', error?.message || 'Unable to reset app.');
    }
  };

  const handleSeedWeeklyReview = async (scenario: WeeklyReviewSeedScenario) => {
    try {
      if (resetBeforeWeeklySeed) {
        await resetApp();
      }
      const result = await seedWeeklyReviewDemo(scenario, user?.id);
      logger.log('[Diagnostics] Seed weekly review demo', {
        scenario,
        eventsWritten: result.eventsWritten,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd,
        totalActivity: result.totalActivity,
        windowEvents: result.windowEvents,
      });
      await AsyncStorage.setItem('livra_last_seed_action', `weeklyReview:${scenario}`);
      await queryClient.invalidateQueries({ queryKey: ['weeklyReview'] });
      await queryClient.refetchQueries({ queryKey: ['weeklyReview'] });
      const review = await getWeeklyReview(getAppDate(), user?.id);
      logger.log('[Diagnostics] Weekly review summary after demo seed', {
        totalActivity: review.totalActivity,
        weekStart: review.weekStart,
        weekEnd: review.weekEnd,
      });
      await loadDevStatus();
      if (result.windowEvents === 0) {
        Alert.alert('Seed Warning', 'Seeded, but no events were found in the review window.');
      } else {
        Alert.alert('Seeded', `Weekly Review demo seeded: ${scenario}`);
      }
      router.push('/(tabs)/tracking');
    } catch (error: any) {
      Alert.alert('Seed Failed', error?.message || 'Unable to seed Weekly Review demo.');
    }
  };

  useEffect(() => {
    loadDevStatus();
    void refreshSyncDiagSnapshot();
  }, [user?.id, refreshSyncDiagSnapshot]);

  const handleResetFlags = async () => {
    await resetFlagOverrides();
    Alert.alert('Flags Reset', 'All feature flag overrides cleared.');
  };

  const handleOpenIapDiagnostics = () => {
    unlockDashboard();
    router.push('/iap-dashboard');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" style={[styles.title, { color: themeColors.text }]}>
          Diagnostics
        </AppText>
        {!showDevInjectionUI ? (
          <AppText variant="caption" style={[styles.readOnlyHint, { color: themeColors.textSecondary }]}>
            Read-only device summary. No data can be changed from this screen.
          </AppText>
        ) : null}

        {user ? (
          <View style={styles.section}>
            <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              Sync health
            </AppText>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Core last synced:{' '}
                {syncDiagSnapshot?.coreSyncedAtIso
                  ? new Date(syncDiagSnapshot.coreSyncedAtIso).toLocaleString()
                  : 'never (no successful sync recorded on device)'}
              </AppText>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Streak recompute (last): {syncDiagSnapshot?.lastStreakRecomputeSource ?? 'none'}
              </AppText>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Same-name mark groups (different ids): {syncDiagSnapshot?.duplicateMarkNameGroupCount ?? 0}
              </AppText>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Maintenance warnings:{' '}
                {syncDiagSnapshot?.maintenanceWarnings?.length
                  ? syncDiagSnapshot.maintenanceWarnings.join(', ')
                  : 'none'}
              </AppText>
              <AppText variant="caption" style={[styles.cardText, { color: themeColors.textTertiary }]}>
                Persisted after each successful core sync (push+pull). Maintenance codes are best-effort post-steps;
                core data can still be correct if a code is listed. No account secrets logged.
              </AppText>
            </View>
            <View style={[styles.card, { backgroundColor: themeColors.surface, marginTop: spacing.sm }]}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                Totals vs lc_events (local)
              </AppText>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Mismatches (row total ≠ replay of non-deleted events):{' '}
                {totalMismatchSummary === null ? '…' : totalMismatchSummary.count}
              </AppText>
              {totalMismatchSummary && totalMismatchSummary.count > 0 ? (
                <AppText variant="caption" style={[styles.cardText, { color: themeColors.textTertiary }]}>
                  Sample mark ids: {totalMismatchSummary.sampleIds.join(', ') || '—'}
                </AppText>
              ) : null}
              <AppText variant="caption" style={[styles.cardText, { color: themeColors.textTertiary }]}>
                Refreshed when this screen loads. No names or tokens logged.
              </AppText>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            Environment
          </AppText>
          <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
            <AppText variant="body" style={[styles.cardText, { color: themeColors.text }]}>
              Mode: {env.isProduction ? 'production' : env.isPreview ? 'preview' : 'development'}
            </AppText>
            {showDevInjectionUI ? (
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Diagnostics unlocked: {diagnosticsUnlocked ? 'yes' : 'no'}
              </AppText>
            ) : null}
            <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
              Execution environment: {env.executionEnvironment}
            </AppText>
            <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
              App ownership: {env.appOwnership}
            </AppText>
            {devStatus && (
              <>
                <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                  Local date: {devStatus.localDate}
                </AppText>
                <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                  Review window: {devStatus.weekStart} → {devStatus.weekEnd}
                </AppText>
                <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                  Events in window: {devStatus.windowEvents}
                </AppText>
                <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                  Dates in window: {devStatus.windowDates.join(', ') || 'none'}
                </AppText>
                <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                  Source table: lc_events (event_type = 'increment')
                </AppText>
                {showDevInjectionUI ? (
                  <>
                    <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                      Last seed action: {devStatus.lastSeedAction || 'none'}
                    </AppText>
                    <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                      Seed user ID: {devStatus.seedUserId || 'none'}
                    </AppText>
                  </>
                ) : null}
              </>
            )}
          </View>
        </View>

        {!user && !showDevInjectionUI ? (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Sign in to view account sync health and totals checks.
              </AppText>
            </View>
          </View>
        ) : null}

        {__DEV__ && (
          <View style={styles.section}>
            <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              Simulated app date
            </AppText>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              <AppText variant="body" style={[styles.cardText, { color: themeColors.text }]}>
                Effective “today”: {formatDate(getAppDate())}
              </AppText>
              <AppText variant="caption" style={[styles.cardText, { color: themeColors.textSecondary }]}>
                Override: {debugDateOverride ?? 'none (system clock)'}
              </AppText>
            </View>
            <View style={styles.rowButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonFlex, { backgroundColor: themeColors.surface }]}
                onPress={() => useRealDate()}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Use real date
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonFlex, { backgroundColor: themeColors.surface }]}
                onPress={() => shiftDebugDateByDays(1)}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  +1 day
                </AppText>
              </TouchableOpacity>
            </View>
            <View style={styles.rowButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonFlex, { backgroundColor: themeColors.surface }]}
                onPress={() => shiftDebugDateByDays(3)}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  +3 days
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonFlex, { backgroundColor: themeColors.surface }]}
                onPress={() => shiftDebugDateByDays(7)}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  +7 days
                </AppText>
              </TouchableOpacity>
            </View>
            <TextInput
              value={manualSimDate}
              onChangeText={setManualSimDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={themeColors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.manualDateInput,
                {
                  color: themeColors.text,
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.background,
                },
              ]}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColors.surface }]}
              onPress={() => {
                const t = manualSimDate.trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
                  Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
                  return;
                }
                setDebugDateOverride(t).catch(() => {});
                setManualSimDate('');
              }}
            >
              <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                Set manual date
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {showDevInjectionUI ? (
          <>
            <View style={styles.section}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                Feature Flags
              </AppText>
              {flagRows.map((flag) => {
                const override = getFlagOverride(flag.key);
                return (
                  <View key={flag.key} style={[styles.settingRow, { backgroundColor: themeColors.surface }]}>
                    <View style={styles.flagInfo}>
                      <AppText variant="body" style={[styles.settingLabel, { color: themeColors.text }]}>
                        {flag.label}
                      </AppText>
                      <AppText variant="caption" style={[styles.settingMeta, { color: themeColors.textSecondary }]}>
                        Default: {defaultFlags[flag.key] ? 'on' : 'off'}
                        {typeof override === 'boolean' ? ` • Override: ${override ? 'on' : 'off'}` : ''}
                      </AppText>
                    </View>
                    <Switch value={flag.value} onValueChange={flag.onChange} />
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleResetFlags}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Reset Flag Overrides
                </AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                Simulation
              </AppText>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleSeedDemo}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed Demo Data
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleSeedHighUsage}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Simulate High Usage
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleBrokenStreak}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Simulate Streak Loss
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handlePerfectWeek}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Simulate Perfect Week
                </AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                Weekly Review Demo
              </AppText>
              <AppText variant="caption" style={[styles.warningText, { color: themeColors.textSecondary }]}>
                Seeding adds demo activity on top of existing data. Use “Reset App” to start fresh.
              </AppText>
              <View style={[styles.settingRow, { backgroundColor: themeColors.surface }]}>
                <AppText variant="body" style={[styles.settingLabel, { color: themeColors.text }]}>
                  Reset before seeding
                </AppText>
                <Switch value={resetBeforeWeeklySeed} onValueChange={setResetBeforeWeeklySeed} />
              </View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => handleSeedWeeklyReview('balanced')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed: Balanced Week
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => handleSeedWeeklyReview('perfect')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed: Perfect Week
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => handleSeedWeeklyReview('midweekDip')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed: Midweek Dip
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => handleSeedWeeklyReview('strongFinish')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed: Strong Finish
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => handleSeedWeeklyReview('chaotic')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Seed: Chaotic Week
                </AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                Maintenance
              </AppText>
              {weeklyReview && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: themeColors.surface }]}
                  onPress={() => router.push('/(tabs)/tracking')}
                >
                  <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                    Open Tracking (weekly snapshot)
                  </AppText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleResetApp}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Reset App
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleOpenIapDiagnostics}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Open IAP Diagnostics
                </AppText>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  readOnlyHint: {
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  cardText: {
    marginBottom: spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  flagInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    marginBottom: spacing.xs,
    fontSize: fontSize.sm,
  },
  settingMeta: {
    opacity: 0.85,
  },
  button: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonText: {
    fontWeight: '600',
  },
  rowButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  buttonFlex: {
    flex: 1,
    marginBottom: 0,
  },
  manualDateInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
  },
  warningText: {
    marginBottom: spacing.sm,
  },
});
