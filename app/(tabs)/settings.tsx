import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  User,
  Bell,
  LinkSimple,
  Star,
  Sun,
  ArrowsClockwise,
  DownloadSimple,
  Trash,
  Question,
  ChatText,
  Gauge,
  Info,
  CaretRight,
  PencilSimple,
  Envelope,
  Lock,
  type Icon,
  type IconProps,
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { DeleteAccountDialog } from '../../components/ui/DeleteAccountDialog';
import { confirm } from '../../components/ui/overlays';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';

import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { isApplePrivateRelayEmail } from '../../lib/auth/accountCredentials';
import { clearSyncCursors } from '../../lib/sync/syncCursors';
import { resetDatabaseState } from '../../lib/db';
import { generateAllCountersCSV } from '../../lib/csv';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { canExportData } from '../../lib/gating';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import { useFocusEffect } from 'expo-router';
import { readSyncDiagSnapshot, type SyncDiagSnapshotV1 } from '../../lib/sync/syncDiagSnapshot';
import { getAvatarUrl, refreshAvatarUrl } from '../../lib/storage/avatarStorage';
import { getPace, setPace, paceWeeklyTarget, PACE_LABELS, type PaceLevel } from '../../lib/paceSetting';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

/** Matches tabBarStyle.height in app/(tabs)/_layout.tsx */
const TAB_BAR_CONTENT_HEIGHT = 64;

// ---------------------------------------------------------------------------
// SettingsCard — white surface card wrapping rows
// ---------------------------------------------------------------------------
interface SettingsCardProps {
  children: React.ReactNode;
}
function SettingsCard({ children }: SettingsCardProps) {
  const c = themedColors(useEffectiveTheme());
  return <View style={[cardStyles.card, { backgroundColor: c.surface }]}>{children}</View>;
}
const cardStyles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
});

// ---------------------------------------------------------------------------
// SettingsRow — standard tappable row inside a card
// ---------------------------------------------------------------------------
interface SettingsRowProps {
  icon: Icon;
  label: string;
  onPress?: () => void;
  isLast?: boolean;
  labelColor?: string;
  hideChevron?: boolean;
  rightElement?: React.ReactNode;
}
function SettingsRow({
  icon,
  label,
  onPress,
  isLast,
  labelColor,
  hideChevron,
  rightElement,
}: SettingsRowProps) {
  const c = themedColors(useEffectiveTheme());
  const RowIcon = icon;
  return (
    <TouchableOpacity
      style={[rowStyles.row, !isLast && [rowStyles.rowBorder, { borderBottomColor: c.borderLight }]]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <RowIcon size={18} color={c.inkMid} weight="regular" />
      <Text style={[rowStyles.label, { color: labelColor ?? c.inkDark }]}>{label}</Text>
      {rightElement ? (
        rightElement
      ) : !hideChevron ? (
        <CaretRight size={16} color={c.inkMuted} weight="bold" />
      ) : null}
    </TouchableOpacity>
  );
}
const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  label: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SettingsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const setThemeMode = useUIStore((s) => s.setThemeMode);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user, signOut: authSignOut } = useAuth();
  const { sync, syncState } = useSync();
  const { isProUnlocked } = useIapSubscriptions();
  const { counters } = useCounters();
  const { events } = useEventsStore();
  const { showSuccess, showError } = useNotification();
  const supabase = getSupabaseClient();

  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [persistedSyncDiag, setPersistedSyncDiag] = useState<SyncDiagSnapshotV1 | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [pace, setPaceState] = useState<PaceLevel>('steady');

  useEffect(() => {
    let active = true;
    getPace().then((p) => { if (active) setPaceState(p); });
    return () => { active = false; };
  }, []);

  const handlePaceChange = useCallback(async (next: PaceLevel) => {
    const prior = pace;
    setPaceState(next); // optimistic
    try {
      await setPace(next);
      const marks = useMarksStore.getState().marks;
      for (const mark of marks) {
        if (mark.deleted_at) continue;
        const target = paceWeeklyTarget(mark, next);
        if (target != null && target !== mark.weekly_target) {
          await useMarksStore.getState().updateMark(mark.id, { weekly_target: target });
        }
      }
      showSuccess('Pace updated across your marks.');
    } catch (e: any) {
      logger.error('[Settings] pace change failed:', e);
      setPaceState(prior);
      showError('Could not update your pace. Please try again.');
    }
  }, [pace, showSuccess, showError]);

  const emailVerified = !!user?.email_confirmed_at;
  const onPrivateRelay = isApplePrivateRelayEmail(user?.email);

  const refreshRotation = useRef(new Animated.Value(0)).current;
  const lastSyncErrorRef = useRef<string | null>(null);

  // --- Load persisted sync diag on focus ---
  const refreshPersistedSyncDiag = useCallback(async () => {
    setPersistedSyncDiag(await readSyncDiagSnapshot());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPersistedSyncDiag();
    }, [refreshPersistedSyncDiag]),
  );

  useEffect(() => {
    void refreshPersistedSyncDiag();
  }, [syncState.lastSyncedAt, refreshPersistedSyncDiag]);

  // --- Load profile display name ---
  useEffect(() => {
    if (!user?.id) { setProfileDisplayName(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setProfileDisplayName(data?.display_name?.trim() || null);
      } catch { if (!cancelled) setProfileDisplayName(null); }
    })();
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  // --- Load profile image ---
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const avatarUrl = await getAvatarUrl(user.id, 3600);
        if (cancelled) return;
        if (avatarUrl) {
          setProfileImageUri(avatarUrl);
          await AsyncStorage.setItem('profile_image_uri', avatarUrl);
          return;
        }
        const storedUri = await AsyncStorage.getItem('profile_image_uri');
        if (!storedUri) return;
        if (!storedUri.startsWith('http')) {
          setProfileImageUri(storedUri);
        } else {
          const refreshed = await refreshAvatarUrl(user.id, storedUri, 3600);
          if (refreshed) {
            setProfileImageUri(refreshed);
            await AsyncStorage.setItem('profile_image_uri', refreshed);
          } else {
            await AsyncStorage.removeItem('profile_image_uri');
            setProfileImageUri(null);
          }
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // --- Sync error toast ---
  useEffect(() => {
    if (!syncState.error) { lastSyncErrorRef.current = null; return; }
    if (lastSyncErrorRef.current === syncState.error) return;
    lastSyncErrorRef.current = syncState.error;
    showError(syncState.error);
  }, [syncState.error, showError]);

  // --- Derived values ---
  const profileName = useMemo(() => {
    if (!user) return 'Guest user';
    if (profileDisplayName) return profileDisplayName;
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    if (meta) {
      for (const key of ['full_name', 'name', 'display_name'] as const) {
        const v = meta[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return user.email ?? 'Guest user';
  }, [user, profileDisplayName]);

  const memberSince = useMemo(() => {
    if (!user?.created_at) return null;
    try {
      return new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch { return null; }
  }, [user?.created_at]);

  const syncStatusText = useMemo(() => {
    if (syncState.isSyncing) return 'Syncing...';
    const ts = persistedSyncDiag?.coreSyncedAtIso ?? syncState.lastSyncedAt;
    if (ts) return `Synced ${new Date(ts).toLocaleTimeString()}`;
    return 'Up to date';
  }, [syncState.isSyncing, persistedSyncDiag, syncState.lastSyncedAt]);

  const refreshIconRotation = refreshRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // --- Handlers ---
  const handleSync = async () => {
    refreshRotation.setValue(0);
    Animated.loop(
      Animated.timing(refreshRotation, { toValue: 1, duration: 1000, useNativeDriver: true })
    ).start();
    try {
      await sync();
      showSuccess('Data synced successfully!');
    } catch (e: any) {
      showError(e.message || 'Failed to sync data');
    } finally {
      refreshRotation.stopAnimation();
      refreshRotation.setValue(0);
    }
  };

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'Are you sure you want to sign out?',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    try {
      await clearSyncCursors();
      await AsyncStorage.removeItem('pro_unlocked');
      router.push('/auth/signing-out');
    } catch (error) {
      logger.error('Error preparing sign out:', error);
      showError('Failed to prepare sign out. Please try again.');
    }
  };

  const handleDeleteAccount = () => {
    if (!user?.id || isDeletingAccount) return;
    setDeleteDialogVisible(true);
  };

  const performAccountDeletion = async () => {
    setIsDeletingAccount(true);
    try {
      // Service-role deletion of the auth user (cascades to all owned data).
      // functions.invoke attaches the current session's JWT as the bearer token,
      // which the Edge Function uses to resolve the caller — a user can only
      // delete themselves.
      const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });
      const ok = !error && (data as { ok?: boolean } | null)?.ok === true;
      if (!ok) {
        logger.error('[Settings] Account deletion failed:', error?.message ?? data);
        setIsDeletingAccount(false);
        setDeleteDialogVisible(false);
        showError('Something went wrong deleting your account. Please check your connection and try again.');
        return;
      }

      // Clear the local session (best-effort — server already removed the user).
      try {
        await authSignOut();
      } catch (signOutError) {
        logger.warn('[Settings] signOut after deletion failed (continuing):', signOutError);
      }

      // Wipe all local AsyncStorage keys so no deleted-account state lingers.
      try {
        await AsyncStorage.clear();
      } catch (storageError) {
        logger.warn('[Settings] AsyncStorage.clear after deletion failed:', storageError);
      }

      router.replace('/auth/signin');
    } catch (e: any) {
      logger.error('[Settings] Account deletion threw:', e);
      setIsDeletingAccount(false);
      setDeleteDialogVisible(false);
      showError('Something went wrong deleting your account. Please check your connection and try again.');
    }
  };

  const handleResendVerification = async () => {
    if (!user?.email || resendingVerification) return;
    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw error;
      showSuccess('Verification email sent. Check your inbox.');
    } catch (e: any) {
      showError(e?.message || 'Could not send verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  const handleExportMarks = async () => {
    if (!canExportData(isProUnlocked)) {
      const seePlus = await confirm({
        title: 'Export is a Livra+ perk',
        message: 'Your history is always yours to see. Livra+ adds CSV export so you can take it anywhere.',
        confirmLabel: 'See Livra+',
        cancelLabel: 'Not now',
      });
      if (seePlus) router.push('/paywall');
      return;
    }
    try {
      const eventsMap = new Map();
      counters.forEach((counter) => {
        eventsMap.set(counter.id, events.filter((e) => e.mark_id === counter.id));
      });
      const csv = generateAllCountersCSV(counters, eventsMap);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        showError('Sharing is not available on this device.');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      const fileUri = `${FileSystem.cacheDirectory}livra-marks-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Marks',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e: any) {
      showError(e.message || 'Failed to export marks.');
    }
  };

  const handleResetAllData = async () => {
    const ok = await confirm({
      title: 'Reset all data?',
      message: 'This permanently deletes all your marks, goals, and history on this device. Your account and sign-in stay intact. This cannot be undone.',
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    try {
      await resetDatabaseState();
      // Reload the in-memory stores so the UI reflects the wipe.
      await Promise.all([
        useMarksStore.getState().loadMarks(user?.id),
        user?.id ? useGoalsStore.getState().loadGoals(user.id) : Promise.resolve(),
        useEventsStore.getState().loadEvents(undefined, user?.id),
      ]);
      showSuccess('All local data has been reset.');
    } catch (e: any) {
      logger.error('[Settings] Reset All Data failed:', e);
      showError(e?.message || 'Failed to reset data.');
    }
  };

  const scrollContentBottomPad = spacing.xxl + TAB_BAR_CONTENT_HEIGHT + insets.bottom + spacing.lg;

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader title="Settings" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollContentBottomPad }]}>

        {/* ── Profile Mini-Card — the single entry point to profile editing ── */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: c.surface }]}
          onPress={() => router.push('/settings/profile' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.profileCardRow}>
            <View style={[styles.avatarCircle, { backgroundColor: c.surfaceAlt, borderColor: c.forest }]}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              ) : (
                <User size={24} color={c.inkMid} weight="duotone" />
              )}
            </View>
            <View style={styles.profileMeta}>
              <Text style={[styles.profileName, { color: c.inkDark }]}>{profileName}</Text>
              {user?.email ? (
                <Text style={[styles.profileEmail, { color: c.inkMuted }]}>{user.email}</Text>
              ) : null}
              {memberSince ? (
                <Text style={[styles.profileSince, { color: c.inkMuted }]}>Member since {memberSince}</Text>
              ) : null}
            </View>
            <PencilSimple size={16} color={c.inkMuted} weight="regular" />
          </View>
        </TouchableOpacity>

        {/* ── Email-not-verified nudge ── */}
        {user && !emailVerified ? (
          <View style={[styles.verifyBanner, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
            <Envelope size={16} color={c.inkMid} weight="regular" />
            <Text style={[styles.verifyText, { color: c.inkMid }]}>
              Your email isn’t verified yet.
            </Text>
            <TouchableOpacity onPress={handleResendVerification} disabled={resendingVerification} hitSlop={8}>
              <Text style={[styles.verifyAction, { color: c.accent }]}>
                {resendingVerification ? 'Sending…' : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : onPrivateRelay ? (
          /* ── Apple private-relay nudge: Apple hides the real address ── */
          <View style={[styles.verifyBanner, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
            <Envelope size={16} color={c.inkMid} weight="regular" />
            <Text style={[styles.verifyText, { color: c.inkMid }]}>
              Apple hides your real email. Add your own so account mail reaches you.
            </Text>
            <TouchableOpacity onPress={() => router.push('/settings/account' as any)} activeOpacity={0.7}>
              <Text style={[styles.verifyAction, { color: c.accent }]}>Set email</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── ACCOUNT ── */}
        <SectionLabel style={styles.sectionLabel}>ACCOUNT</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon={Lock}
            label="Sign-in"
            onPress={() => router.push('/settings/account' as any)}
          />
          <SettingsRow
            icon={Bell}
            label="Notifications"
            onPress={() => router.push('/settings/notifications' as any)}
          />
          <SettingsRow
            icon={LinkSimple}
            label="Integrations"
            onPress={() => router.push('/settings/integrations' as any)}
          />
          <SettingsRow
            icon={Star}
            label="Subscription"
            onPress={() => router.push('/paywall')}
            isLast
            rightElement={
              isProUnlocked ? (
                <View style={[styles.proBadge, { backgroundColor: c.forest }]}>
                  <Text style={[styles.proBadgeText, { color: c.inkInverse }]}>PRO</Text>
                </View>
              ) : (
                <CaretRight size={16} color={c.inkMuted} weight="bold" />
              )
            }
          />
        </SettingsCard>

        {/* ── PREFERENCES ── */}
        <SectionLabel style={styles.sectionLabel}>PREFERENCES</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon={Sun}
            label="Appearance"
            hideChevron
            rightElement={
              <View style={[styles.themeToggle, { backgroundColor: c.surfaceAlt }]}>
                {(['light', 'dark'] as const).map((t) => {
                  const active = theme === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.themeTogglePill, active && { backgroundColor: c.forest }]}
                      onPress={() => { void setThemeMode(t); }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.themeToggleText,
                          { color: active ? c.inkInverse : c.inkMid },
                        ]}
                      >
                        {t === 'light' ? 'Light' : 'Dark'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            }
          />
          <SettingsRow
            icon={Gauge}
            label="Pace"
            hideChevron
            rightElement={
              <View style={[styles.themeToggle, { backgroundColor: c.surfaceAlt }]}>
                {(['easing', 'steady', 'push'] as const).map((p) => {
                  const active = pace === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.themeTogglePill, active && { backgroundColor: c.forest }]}
                      onPress={() => { void handlePaceChange(p); }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.themeToggleText,
                          { color: active ? c.inkInverse : c.inkMid },
                        ]}
                      >
                        {PACE_LABELS[p]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            }
          />
          <SettingsRow
            icon={ArrowsClockwise}
            label="Data & Sync"
            isLast
            onPress={handleSync}
            hideChevron
            rightElement={
              <Animated.View style={{ transform: [{ rotate: syncState.isSyncing ? refreshIconRotation : '0deg' }] }}>
                <Text style={[styles.inlineHint, { color: c.inkMuted }]}>{syncStatusText}</Text>
              </Animated.View>
            }
          />
        </SettingsCard>

        {/* ── DATA ── */}
        <SectionLabel style={styles.sectionLabel}>DATA</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon={DownloadSimple}
            label="Export Marks"
            onPress={handleExportMarks}
          />
          <SettingsRow
            icon={Trash}
            label="Reset All Data"
            isLast
            labelColor={c.danger}
            hideChevron
            onPress={handleResetAllData}
          />
        </SettingsCard>

        {/* ── SUPPORT ── */}
        <SectionLabel style={styles.sectionLabel}>SUPPORT</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon={Question}
            label="Help Center"
            onPress={() => Linking.openURL('https://livralife.com/help').catch(() => {})}
          />
          <SettingsRow
            icon={ChatText}
            label="Send Feedback"
            onPress={() => Linking.openURL('mailto:support@livralife.com').catch(() => {})}
          />
          <SettingsRow
            icon={Star}
            label="Rate Livra"
            onPress={() => Linking.openURL('itms-apps://itunes.apple.com/app/id6741537890?action=write-review').catch(() => {})}
          />
          <SettingsRow
            icon={Info}
            label="About Livra"
            isLast
            onPress={() => router.push('/settings/about' as any)}
          />
        </SettingsCard>

        {/* ── Destructive actions ── */}
        <View style={styles.destructiveSection}>
          {user ? (
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={[styles.signOutText, { color: c.danger }]}>Sign Out</Text>
            </TouchableOpacity>
          ) : null}
          {user ? (
            <TouchableOpacity onPress={handleDeleteAccount} disabled={isDeletingAccount} activeOpacity={0.7}>
              <Text style={[styles.deleteAccountText, { color: c.danger }]}>
                {isDeletingAccount ? 'Deleting...' : 'Delete Account'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={[styles.version, { color: c.inkMuted }]}>
            LIVRA V{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>

      <DeleteAccountDialog
        visible={deleteDialogVisible}
        deleting={isDeletingAccount}
        onClose={() => setDeleteDialogVisible(false)}
        onConfirm={() => { void performAccountDeletion(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  // Profile mini-card
  profileCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  profileCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  profileMeta: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[17],
  },
  profileEmail: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },
  profileSince: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },

  // Email-not-verified nudge
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  verifyText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },
  verifyAction: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
  },

  // Section label
  sectionLabel: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  // Inline row right-side hints
  inlineHint: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },

  // Inline light/dark theme toggle
  themeToggle: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 2,
  },
  themeTogglePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  themeToggleText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
  },

  // Pro badge
  proBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize['2xs'],
    letterSpacing: 0.8,
  },

  // Destructive section
  destructiveSection: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  signOutText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  deleteAccountText: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  version: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
