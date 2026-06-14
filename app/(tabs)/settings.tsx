import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { LevelProgressBar } from '../../components/LevelProgressBar';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { ProfileEditSheet } from '../../components/sheets/ProfileEditSheet';

import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { clearSyncCursors } from '../../lib/sync/syncCursors';
import { generateAllCountersCSV } from '../../lib/csv';
import { canExportData } from '../../lib/gating';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import { useFocusEffect } from 'expo-router';
import { readSyncDiagSnapshot, type SyncDiagSnapshotV1 } from '../../lib/sync/syncDiagSnapshot';
import { getAvatarUrl, refreshAvatarUrl } from '../../lib/storage/avatarStorage';
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
  icon: string;
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
  return (
    <TouchableOpacity
      style={[rowStyles.row, !isLast && [rowStyles.rowBorder, { borderBottomColor: c.borderLight }]]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <Feather name={icon as any} size={18} color={c.inkMid} />
      <Text style={[rowStyles.label, { color: labelColor ?? c.inkDark }]}>{label}</Text>
      {rightElement ? (
        rightElement
      ) : !hideChevron ? (
        <Feather name="chevron-right" size={16} color={c.inkMuted} />
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
    fontSize: 15,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function SettingsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
  const [editSheetVisible, setEditSheetVisible] = useState(false);

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

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSyncCursors();
              await AsyncStorage.removeItem('pro_unlocked');
              router.push('/auth/signing-out');
            } catch (error) {
              logger.error('Error preparing sign out:', error);
              Alert.alert('Error', 'Failed to prepare sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    if (!user?.id) return;
    Alert.alert(
      'Delete Account',
      'To permanently delete your account and all associated data, email support@getlivra.app from your registered address. We will process your request within 48 hours. Your account will remain active until deletion is confirmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Email Support',
          onPress: () => {
            Linking.openURL('mailto:support@getlivra.app?subject=Account%20Deletion%20Request').catch(() => {});
          },
        },
      ]
    );
  };

  const handleExportMarks = async () => {
    if (!canExportData(isProUnlocked)) {
      Alert.alert(
        'Export is a Livra+ perk',
        'Your history is always yours to see. Livra+ adds CSV export so you can take it anywhere.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Livra+', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }
    try {
      const eventsMap = new Map();
      counters.forEach((counter) => {
        eventsMap.set(counter.id, events.filter((e) => e.mark_id === counter.id));
      });
      const csv = generateAllCountersCSV(counters, eventsMap);
      logger.log('[Settings] Marks CSV export:', csv.length, 'chars');
      showSuccess('Export ready — sharing coming soon.');
    } catch (e: any) {
      showError(e.message || 'Failed to export marks.');
    }
  };

  const scrollContentBottomPad = spacing.xxl + TAB_BAR_CONTENT_HEIGHT + insets.bottom + spacing.lg;

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader title="Settings" showAvatar />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollContentBottomPad }]}>

        {/* ── Profile Mini-Card ── */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: c.surface }]}
          onPress={() => setEditSheetVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.profileCardRow}>
            <View style={[styles.avatarCircle, { backgroundColor: c.surfaceAlt, borderColor: c.forest }]}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              ) : (
                <Feather name="user" size={24} color={c.inkMid} />
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
            <Feather name="edit-2" size={16} color={c.inkMuted} />
          </View>
          <View style={styles.xpBarWrapper}>
            <LevelProgressBar />
          </View>
        </TouchableOpacity>

        {/* ── ACCOUNT ── */}
        <SectionLabel style={styles.sectionLabel}>ACCOUNT</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon="user"
            label="Edit Profile"
            onPress={() => router.push('/settings/profile' as any)}
          />
          <SettingsRow
            icon="bell"
            label="Notifications"
            onPress={() => router.push('/settings/notifications' as any)}
          />
          <SettingsRow
            icon="shield"
            label="Privacy & Security"
            onPress={() => router.push('/settings/privacy' as any)}
          />
          <SettingsRow
            icon="link"
            label="Integrations"
            onPress={() => router.push('/settings/integrations' as any)}
          />
          <SettingsRow
            icon="star"
            label="Subscription"
            onPress={() => router.push('/paywall')}
            isLast
            rightElement={
              isProUnlocked ? (
                <View style={[styles.proBadge, { backgroundColor: c.forest }]}>
                  <Text style={[styles.proBadgeText, { color: c.inkInverse }]}>PRO</Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={16} color={c.inkMuted} />
              )
            }
          />
        </SettingsCard>

        {/* ── PREFERENCES ── */}
        <SectionLabel style={styles.sectionLabel}>PREFERENCES</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon="sun"
            label="Appearance"
            onPress={() => router.push('/settings/appearance' as any)}
          />
          <SettingsRow
            icon="calendar"
            label="Week Start Day"
            hideChevron
            rightElement={
              <Text style={[styles.inlineHint, { color: c.inkMuted }]}>Monday</Text>
            }
          />
          <SettingsRow
            icon="refresh-cw"
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
            icon="download"
            label="Export Marks"
            onPress={handleExportMarks}
          />
          <SettingsRow
            icon="download"
            label="Export Goals"
            onPress={() => console.log('[Settings] Export Goals — TODO')}
          />
          <SettingsRow
            icon="upload"
            label="Import Data"
            onPress={() => console.log('[Settings] Import Data — TODO')}
          />
          <SettingsRow
            icon="trash-2"
            label="Reset All Data"
            isLast
            labelColor={c.danger}
            hideChevron
            onPress={() =>
              Alert.alert(
                'Reset All Data',
                'This will permanently delete all your local data. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => console.log('[Settings] Reset All Data confirmed'),
                  },
                ]
              )
            }
          />
        </SettingsCard>

        {/* ── SUPPORT ── */}
        <SectionLabel style={styles.sectionLabel}>SUPPORT</SectionLabel>
        <SettingsCard>
          <SettingsRow
            icon="help-circle"
            label="Help Center"
            onPress={() => Linking.openURL('https://livralife.com/help').catch(() => {})}
          />
          <SettingsRow
            icon="message-square"
            label="Send Feedback"
            onPress={() => Linking.openURL('mailto:support@livralife.com').catch(() => {})}
          />
          <SettingsRow
            icon="star"
            label="Rate Livra"
            onPress={() => Linking.openURL('itms-apps://itunes.apple.com/app/id6741537890?action=write-review').catch(() => {})}
          />
          <SettingsRow
            icon="info"
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

      <ProfileEditSheet
        visible={editSheetVisible}
        onClose={() => setEditSheetVisible(false)}
        initialEmail={user?.email ?? ''}
        initialName={(user?.user_metadata as Record<string, unknown> | undefined)?.['full_name'] as string ?? ''}
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
  xpBarWrapper: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
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
    fontSize: 17,
  },
  profileEmail: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  profileSince: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: spacing.xs,
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
    fontSize: 13,
  },

  // Pro badge
  proBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  proBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
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
    fontSize: 15,
  },
  deleteAccountText: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  version: {
    fontFamily: fonts.sans,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
