import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Pulse, ArrowsClockwise, Copy } from 'phosphor-react-native';
import {
  getDiagSnapshot,
  getDiagnosticsAsString,
  getSupportDiagnosticsEnabled,
  redactSensitiveData,
  setSupportDiagnosticsEnabled,
} from '../lib/debug/iapDiagnostics';
import { isDashboardUnlocked, resetDashboardUnlock } from '../lib/debug/dashboardUnlock';
import { getIapService } from '../lib/services/iap/getIapService';
import { themedColors, spacing, borderRadius, fontSize, fontWeight, headerControl } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from '../components/Typography';
import { logger } from '../lib/utils/logger';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { env } from '../lib/env';

export default function IapDashboardScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const iapService = getIapService();
  const [snapshot, setSnapshot] = useState(getDiagSnapshot());
  const [managerDiagnostics, setManagerDiagnostics] = useState<any>(null);
  const [supportDiagnosticsEnabled, setSupportDiagnosticsEnabledState] = useState(false);
  /** Avoid redirecting before AsyncStorage read completes (false was treated as disabled). */
  const [supportDiagnosticsPrefLoaded, setSupportDiagnosticsPrefLoaded] = useState(() => env.isDev);

  // Production route guard: require unlock flag or dev mode
  useEffect(() => {
    const isProduction = env.isProduction && Constants.executionEnvironment !== 'storeClient';
    if (isProduction && !isDashboardUnlocked()) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/focus' as any);
      }
      return;
    }
    resetDashboardUnlock();
  }, [router]);

  useEffect(() => {
    const loadDiagnostics = () => {
      try {
        const diag = iapService.getDiagnostics();
        setManagerDiagnostics(diag);
        setSnapshot(getDiagSnapshot());
      } catch (error) {
        logger.error('[IAP Dashboard] Error loading diagnostics:', error);
      }
    };

    loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadSupportToggle = async () => {
      try {
        const enabled = await getSupportDiagnosticsEnabled();
        setSupportDiagnosticsEnabledState(enabled);
      } finally {
        setSupportDiagnosticsPrefLoaded(true);
      }
    };
    void loadSupportToggle();
  }, []);

  useEffect(() => {
    if (env.isDev) return;
    if (!supportDiagnosticsPrefLoaded) return;
    if (!supportDiagnosticsEnabled) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/focus' as any);
      }
    }
  }, [router, supportDiagnosticsEnabled, supportDiagnosticsPrefLoaded]);

  const handleCopy = async () => {
    try {
      const diagnosticsString = getDiagnosticsAsString();
      const redactedManagerDiag = managerDiagnostics ? redactSensitiveData(managerDiagnostics) : null;

      const combined = JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          diagnostics: JSON.parse(diagnosticsString),
          managerDiagnostics: redactedManagerDiag,
        },
        null,
        2
      );

      await Clipboard.setStringAsync(combined);
      Alert.alert('Copied', 'IAP diagnostics copied to clipboard');
    } catch (error) {
      logger.error('[IAP Dashboard] Error copying diagnostics:', error);
      Alert.alert('Error', 'Failed to copy diagnostics. Please try again.');
    }
  };

  const handleRetryIapSetup = async () => {
    try {
      await iapService.retryInit();
      Alert.alert('Retry started', 'IAP setup retry started. Check diagnostics for progress.');
    } catch (error) {
      logger.error('[IAP Dashboard] Retry init error:', error);
      Alert.alert('Retry failed', 'Unable to retry IAP setup. Please try again.');
    }
  };

  const handleToggleSupportDiagnostics = async () => {
    const next = !supportDiagnosticsEnabled;
    await setSupportDiagnosticsEnabled(next);
    setSupportDiagnosticsEnabledState(next);
    Alert.alert(
      'Support Diagnostics',
      next ? 'Support diagnostics enabled.' : 'Support diagnostics disabled.'
    );
  };

  const renderSection = (title: string, content: React.ReactNode) => (
    <View style={[styles.section, { backgroundColor: c.surface }]}>
      <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
        {title}
      </AppText>
      {content}
    </View>
  );

  const renderKeyValue = (label: string, value: any) => (
    <View style={styles.keyValueRow}>
      <AppText variant="caption" style={[styles.key, { color: c.inkMuted }]}>
        {label}:
      </AppText>
      <AppText variant="body" style={[styles.value, { color: c.inkDark }]}>
        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
      </AppText>
    </View>
  );

  if (!env.isDev && !supportDiagnosticsEnabled) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.borderLight }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={c.inkDark} weight="bold" />
        </TouchableOpacity>
        <AppText variant="title" style={[styles.headerTitle, { color: c.inkDark }]}>
          IAP Dashboard
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Manager Diagnostics */}
        {managerDiagnostics && renderSection(
          'IapManager Diagnostics',
          <View style={styles.content}>
            {renderKeyValue('Connection Status', managerDiagnostics.connectionStatus)}
            {renderKeyValue('Is Ready', managerDiagnostics.isReady)}
            {renderKeyValue('Products Loaded', managerDiagnostics.productsLoadedCount)}
            {renderKeyValue('Listeners Registered', managerDiagnostics.state?.listenersRegistered)}
            {renderKeyValue('Bundle ID', managerDiagnostics.bundleId)}
            {renderKeyValue('Is TestFlight', managerDiagnostics.isTestFlight)}
            {renderKeyValue('Last Successful Step', managerDiagnostics.lastSuccessfulStep)}
            {renderKeyValue('SKUs Requested', managerDiagnostics.skusRequested?.join(', '))}
            {renderKeyValue('SKUs Received', managerDiagnostics.skusReceived?.join(', '))}
            {renderKeyValue('Missing SKUs', managerDiagnostics.missingSkus?.join(', ') || 'None')}
            {managerDiagnostics.lastError && renderKeyValue('Last Error', managerDiagnostics.lastError)}
          </View>
        )}

        {/* Diagnostics State */}
        {renderSection(
          'Diagnostics State',
          <View style={styles.content}>
            {renderKeyValue('Connection Status', snapshot.state.connectionStatus)}
            {renderKeyValue('Is Ready', snapshot.state.isReady)}
            {renderKeyValue('Is Loading Products', snapshot.state.isLoadingProducts)}
            {renderKeyValue('Products Returned', snapshot.state.productsReturnedCount)}
            {renderKeyValue('Product IDs', snapshot.state.productIdsReturned?.join(', '))}
            {snapshot.state.lastError && renderKeyValue('Last Error', snapshot.state.lastError)}
            {snapshot.state.lastPurchaseAttempt && renderKeyValue('Last Purchase Attempt', snapshot.state.lastPurchaseAttempt)}
            {snapshot.state.lastPurchaseError && renderKeyValue('Last Purchase Error', snapshot.state.lastPurchaseError)}
            {renderKeyValue('IAP Listeners Active', snapshot.state.iapListenersActive)}
          </View>
        )}

        {/* Support Diagnostics */}
        {renderSection(
          'Support Diagnostics',
          <View style={styles.content}>
            {renderKeyValue('Support Diagnostics Enabled', supportDiagnosticsEnabled)}
            <TouchableOpacity
              style={[styles.copyButton, { backgroundColor: c.forest, marginTop: spacing.sm }]}
              onPress={handleToggleSupportDiagnostics}
            >
              <Pulse size={20} color="#FFFFFF" weight="regular" />
              <AppText variant="button" style={styles.copyButtonText}>
                {supportDiagnosticsEnabled ? 'Disable' : 'Enable'}
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* Retry IAP Setup */}
        {supportDiagnosticsEnabled && renderSection(
          'IAP Recovery',
          <View style={styles.content}>
            <TouchableOpacity
              style={[styles.copyButton, { backgroundColor: c.forest }]}
              onPress={handleRetryIapSetup}
            >
              <ArrowsClockwise size={20} color="#FFFFFF" weight="regular" />
              <AppText variant="button" style={styles.copyButtonText}>
                Retry IAP Setup
              </AppText>
            </TouchableOpacity>
            {managerDiagnostics?.lastError && renderKeyValue('Last Error', managerDiagnostics.lastError)}
          </View>
        )}

        {/* Quick Checks */}
        {renderSection(
          'Quick Checks',
          <View style={styles.content}>
            {renderKeyValue('Has Products', snapshot.quickChecks.hasProducts)}
            {renderKeyValue('Connected', snapshot.quickChecks.connected)}
            {renderKeyValue('SKUs Match Expected', snapshot.quickChecks.skusMatchExpected)}
            {renderKeyValue('IAP Listeners Active', snapshot.quickChecks.iapListenersActive)}
            {renderKeyValue('Can Attempt Purchase', snapshot.quickChecks.canAttemptPurchase)}
          </View>
        )}

        {/* Environment Hints */}
        {renderSection(
          'Environment',
          <View style={styles.content}>
            {renderKeyValue('Is TestFlight', snapshot.state.environmentHints?.isTestFlight)}
            {renderKeyValue('Sandbox Detected', snapshot.state.environmentHints?.sandboxDetected)}
            {renderKeyValue('iOS Version', snapshot.state.environmentHints?.iosVersion)}
            {renderKeyValue('Device Model', snapshot.state.environmentHints?.deviceModel)}
            {renderKeyValue('Bundle ID', snapshot.state.environmentHints?.bundleId)}
          </View>
        )}

        {/* Event Timeline (Last 50) */}
        {renderSection(
          'Event Timeline (Last 50)',
          <View style={styles.content}>
            {snapshot.events.slice(-50).map((event, index) => (
              <View key={index} style={styles.eventItem}>
                <AppText variant="caption" style={[styles.eventTime, { color: c.inkMuted }]}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </AppText>
                <AppText variant="body" style={[styles.eventType, { color: c.inkDark }]}>
                  {event.type}
                </AppText>
                {event.duration && (
                  <AppText variant="caption" style={[styles.eventDuration, { color: c.inkMuted }]}>
                    {event.duration}ms
                  </AppText>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Copy Button */}
      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.borderLight }]}>
        <TouchableOpacity
          style={[styles.copyButton, { backgroundColor: c.forest }]}
          onPress={handleCopy}
        >
          <Copy size={20} color="#FFFFFF" weight="regular" />
          <AppText variant="button" style={styles.copyButtonText}>
            Copy
          </AppText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    // QC4-K: paddingTop = the shared headerControl.topGap (same value as the
    // spacing.md it replaces — pinned to the token so it stays converged).
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  // QC4-K: 40x40 was under the 44pt iOS HIG minimum. Doubles as the trailing
  // spacer that keeps the title optically centred.
  backButton: {
    width: headerControl.minTarget,
    height: headerControl.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  section: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    fontWeight: fontWeight.semibold,
  },
  content: {
    gap: spacing.xs,
  },
  keyValueRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  key: {
    minWidth: 120,
    fontWeight: fontWeight.medium,
  },
  value: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: fontSize.sm,
  },
  eventItem: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  eventTime: {
    fontSize: fontSize.xs,
  },
  eventType: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  eventDuration: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.semibold,
  },
});

