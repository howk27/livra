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
import { Ionicons } from '@expo/vector-icons';
import {
  getDiagSnapshot,
  getDiagnosticsAsString,
  getSupportDiagnosticsEnabled,
  redactSensitiveData,
  setSupportDiagnosticsEnabled,
} from '../lib/debug/iapDiagnostics';
import { isDashboardUnlocked, resetDashboardUnlock } from '../lib/debug/dashboardUnlock';
import { IapManager } from '../lib/services/iap/IapManager';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from '../components/Typography';
import { logger } from '../lib/utils/logger';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';

export default function IapDashboardScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(getDiagSnapshot());
  const [managerDiagnostics, setManagerDiagnostics] = useState<any>(null);
  const [supportDiagnosticsEnabled, setSupportDiagnosticsEnabledState] = useState(false);

  // Production route guard: require unlock flag or dev mode
  useEffect(() => {
    const isProduction = !__DEV__ && Constants.executionEnvironment !== 'storeClient';
    if (isProduction && !isDashboardUnlocked()) {
      router.back();
      return;
    }
    resetDashboardUnlock();
  }, [router]);

  useEffect(() => {
    const loadDiagnostics = () => {
      try {
        const diag = IapManager.getDiagnostics();
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
      const enabled = await getSupportDiagnosticsEnabled();
      setSupportDiagnosticsEnabledState(enabled);
    };
    loadSupportToggle();
  }, []);

  useEffect(() => {
    if (__DEV__) return;
    if (!supportDiagnosticsEnabled) {
      router.back();
    }
  }, [router, supportDiagnosticsEnabled]);

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
      await IapManager.retryInit();
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
    <View style={[styles.section, { backgroundColor: themeColors.surface }]}>
      <AppText variant="subheading" style={[styles.sectionTitle, { color: themeColors.text }]}>
        {title}
      </AppText>
      {content}
    </View>
  );

  const renderKeyValue = (label: string, value: any) => (
    <View style={styles.keyValueRow}>
      <AppText variant="caption" style={[styles.key, { color: themeColors.textSecondary }]}>
        {label}:
      </AppText>
      <AppText variant="body" style={[styles.value, { color: themeColors.text }]}>
        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
      </AppText>
    </View>
  );

  if (!__DEV__ && !supportDiagnosticsEnabled) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <AppText variant="heading" style={[styles.headerTitle, { color: themeColors.text }]}>
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
              style={[styles.copyButton, { backgroundColor: themeColors.primary, marginTop: spacing.sm }]}
              onPress={handleToggleSupportDiagnostics}
            >
              <Ionicons name="pulse-outline" size={20} color="#FFFFFF" />
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
              style={[styles.copyButton, { backgroundColor: themeColors.primary }]}
              onPress={handleRetryIapSetup}
            >
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
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
                <AppText variant="caption" style={[styles.eventTime, { color: themeColors.textSecondary }]}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </AppText>
                <AppText variant="body" style={[styles.eventType, { color: themeColors.text }]}>
                  {event.type}
                </AppText>
                {event.duration && (
                  <AppText variant="caption" style={[styles.eventDuration, { color: themeColors.textSecondary }]}>
                    {event.duration}ms
                  </AppText>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Copy Button */}
      <View style={[styles.footer, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.copyButton, { backgroundColor: themeColors.primary }]}
          onPress={handleCopy}
        >
          <Ionicons name="copy-outline" size={20} color="#FFFFFF" />
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
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

