import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, Plug, Check } from 'phosphor-react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { requestPermissions, isHealthUnavailable } from '../../lib/health/healthPermissions';
import type { HealthKitType } from '../../lib/health/healthTypes';
import { useNotification } from '../../contexts/NotificationContext';
import { logger } from '../../lib/utils/logger';
import { useAuth } from '../../hooks/useAuth';
import { queryKeys } from '../../lib/data/queryKeys';
import type { MarkRow } from '../../lib/data/types';
import { autoBindHealthMarks } from '../../lib/health/autoBind';
import { onHealthConnected, useAutoSyncSettings } from '../../lib/health/autoSyncSettings';
import { checkProStatus } from '../../lib/iap/iap';
import { formatDate } from '../../lib/date';
import { getAppDate } from '../../lib/appDate';

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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Master auto-sync toggle (health-auto-sync T4, spec §2.8): default ON,
  // device-persisted; the trigger (hooks/useHealthAutoSync.ts) reads it per run.
  const autoSyncEnabled = useAutoSyncSettings((s) => s.autoSyncEnabled);
  const autoSyncHydrated = useAutoSyncSettings((s) => s.hydrated);
  const setAutoSyncEnabled = useAutoSyncSettings((s) => s.setAutoSyncEnabled);
  const hydrateAutoSync = useAutoSyncSettings((s) => s.hydrate);
  useEffect(() => {
    void hydrateAutoSync();
  }, [hydrateAutoSync]);

  const activeMarkRows = () =>
    (user?.id ? (queryClient.getQueryData<MarkRow[]>(queryKeys.marks(user.id)) ?? []) : [])
      .filter((r) => !r.deleted_at)
      .map((r) => ({ id: r.id, name: r.name }));

  // Retro-bind for users who connected BEFORE this shipped (the founder's
  // exact state): already-connected accounts get the same pass on mount.
  // Skipped while `connecting` is in flight — the handler's own bind pass
  // owns that window, and racing an unlocked read-modify-write can drop
  // writes (QC64 fix wave, finding 4).
  useEffect(() => {
    if (!healthConnected || connecting) return;
    (async () => {
      const status = await checkProStatus();
      if (!status.effectiveUnlocked) return;
      await autoBindHealthMarks(activeMarkRows());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthConnected, connecting, user?.id]);

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
      // Auto-sync side effects (T4): stamp the connect-day floor explicitly —
      // otherwise the engine lazily stamps the day of its first RUN (T3 finding
      // 4) — and turn the master toggle ON (spec §2.8 default at connect).
      await onHealthConnected(formatDate(getAppDate()));
      // Bulk auto-bind is a Pro perk, same gate as the per-mark connect path
      // (app/mark/[id]/index.tsx handleConnectHealth). Connect itself stays
      // free — a non-Pro user just doesn't get marks bound automatically.
      const status = await checkProStatus();
      const bound = status.effectiveUnlocked
        ? await autoBindHealthMarks(activeMarkRows())
        : [];
      showSuccess(
        bound.length > 0
          ? `Apple Health connected. ${bound.length} mark${bound.length === 1 ? '' : 's'} linked.`
          : 'Apple Health connected.',
      );
    } catch (e) {
      // This used to be a bare `catch {}`: the one screen that knew WHY Apple
      // Health failed threw the reason away, so a missing entitlement, a
      // simulator with no Health app and a refused authorization were one
      // indistinguishable sentence. The copy stays calm; the reason gets logged
      // so the next device report arrives with evidence attached.
      const reason = e instanceof Error ? e.message : String(e);
      logger.error('[Health] connect failed:', reason);
      // QC-1061 item 6: the old single sentence sent the user to
      // "Settings → Privacy → Health", a path that has not existed since iOS 16
      // renamed it Privacy & Security — and it said the same thing whether the
      // build lacked HealthKit entirely or the user simply declined. A missing
      // module is not something tapping in Settings can answer, so it no longer
      // asks anyone to go looking. The remaining case points at the Health app,
      // where per-app read access actually lives.
      showError(
        isHealthUnavailable(e)
          ? 'Apple Health isn’t available on this device.'
          : 'Livra couldn’t reach Apple Health. Give it access in the Health app under Sharing → Apps.'
      );
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
              <Text style={[styles.rowMeta, { color: c.inkMuted }]}>
                Auto-log sleep, workouts & steps
              </Text>
            </View>
            {connecting ? (
              <ActivityIndicator size="small" color={APPLE_HEALTH_RED} />
            ) : healthConnected ? (
              <View
                style={[styles.badge, styles.badgeConnected, { backgroundColor: c.surfaceAlt }]}
              >
                <Check size={13} color={c.inkMuted} weight="bold" />
                <Text style={[styles.badgeText, { color: c.inkMuted }]}>Connected</Text>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: hexToRgba(APPLE_HEALTH_RED, 0.12) }]}>
                <Text style={[styles.badgeText, { color: APPLE_HEALTH_RED }]}>Connect</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Master auto-sync toggle — shown once Health is connected (before
              that there is nothing for it to govern). The native Switch is the
              house toggle (app/settings/notifications.tsx). */}
          {healthConnected && (
            <>
              <View style={[styles.separator, { backgroundColor: c.borderLight }]} />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: c.inkDark }]}>Auto-sync</Text>
                  <Text style={[styles.rowMeta, { color: c.inkMuted }]}>
                    Logs bound marks from Health when you open Livra.
                  </Text>
                </View>
                <Switch
                  value={autoSyncEnabled}
                  onValueChange={(v) => void setAutoSyncEnabled(v)}
                  disabled={!autoSyncHydrated}
                  trackColor={{ false: c.borderMid, true: c.forest }}
                  thumbColor={c.surface}
                  accessibilityLabel="Auto-sync from Apple Health"
                />
              </View>
            </>
          )}
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
