import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Heart, Plug, Check } from 'phosphor-react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { requestPermissions } from '../../lib/health/healthPermissions';
import type { HealthKitType } from '../../lib/health/healthTypes';
import { useNotification } from '../../contexts/NotificationContext';

const APPLE_HEALTH_RED = '#FF2D55';

// The full set the app can auto-log from; a single Connect grants them once.
const HEALTH_CONNECT_TYPES: HealthKitType[] = [
  'workout',
  'sleep',
  'hydration',
  'mindful',
  'steps',
  'running',
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function IntegrationsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const healthConnected = useUIStore((s) => s.healthConnected);
  const setHealthConnected = useUIStore((s) => s.setHealthConnected);
  const { showSuccess, showError } = useNotification();
  const [connecting, setConnecting] = useState(false);

  const handleConnectHealth = async () => {
    if (Platform.OS !== 'ios') {
      showError('Apple Health is available on iPhone only.');
      return;
    }
    if (healthConnected || connecting) return;
    setConnecting(true);
    try {
      // Opens the iOS Health permission sheet for every type the app can read.
      // iOS never reports the grant result (see healthPermissions), so we mark
      // connected on a successful request and let per-mark auto-log take over.
      await requestPermissions(HEALTH_CONNECT_TYPES);
      await setHealthConnected(true);
      showSuccess('Apple Health connected.');
    } catch {
      showError('Apple Health could not be reached. Try Settings → Privacy → Health.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Integrations" />
      <ScrollView contentContainerStyle={styles.content}>

        <SectionLabel style={styles.sectionLabel}>HEALTH</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={handleConnectHealth}
            disabled={healthConnected || connecting}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ disabled: healthConnected || connecting }}
            accessibilityLabel={healthConnected ? 'Apple Health connected' : 'Connect Apple Health'}
          >
            <View style={[styles.iconTile, { backgroundColor: hexToRgba(APPLE_HEALTH_RED, 0.12) }]}>
              <Heart size={20} color={APPLE_HEALTH_RED} weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Apple Health</Text>
              <Text style={[styles.rowMeta, { color: c.inkMuted }]}>Auto-log sleep, workouts & steps</Text>
            </View>
            {connecting ? (
              <ActivityIndicator size="small" color={APPLE_HEALTH_RED} />
            ) : healthConnected ? (
              <View style={[styles.badge, styles.badgeConnected, { backgroundColor: c.surfaceAlt }]}>
                <Check size={13} color={c.inkMuted} weight="bold" />
                <Text style={[styles.badgeText, { color: c.inkMuted }]}>Connected</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: hexToRgba(APPLE_HEALTH_RED, 0.12) }]}>
                <Text style={[styles.badgeText, { color: APPLE_HEALTH_RED }]}>Connect</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <SectionLabel style={[styles.sectionLabel, { opacity: 0.5 }]}>COMING SOON</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface, opacity: 0.5 }]}>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#4285F4', 0.12) }]}>
              <Plug size={20} color="#4285F4" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Google Fit</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: c.borderLight }]} />
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#007AFF', 0.12) }]}>
              <Plug size={20} color="#007AFF" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Garmin</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  separator: { height: 1, marginHorizontal: spacing.lg },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.md },
  rowMeta: { fontFamily: fonts.sans, fontSize: fontSize.sm, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: { fontFamily: fonts.sansMedium, fontSize: fontSize.sm },
});
