import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { User, Camera, PencilSimple } from 'phosphor-react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { PillButton } from '../../components/ui/PillButton';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { themedColors, fonts, spacing, radius, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useAuth } from '../../hooks/useAuth';
import { getSupabaseClient } from '../../lib/supabase';
import { uploadAvatar, getAvatarUrl } from '../../lib/storage/avatarStorage';
import { resolveInitialDisplayName } from '../../lib/profile/displayName';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import {
  describeEmailChangeOutcome,
  hasPasswordIdentity,
  mapEmailChangeError,
  mapPasswordChangeError,
  mapReauthError,
  pendingEmail as pendingEmailOf,
  validateEmailChange,
  validateNewPassword,
  validatePasswordChange,
  type EmailChangeOutcome,
} from '../../lib/auth/accountCredentials';

/**
 * Edit Profile — the one place identity lives: avatar, display name, email and
 * password. Credentials used to sit behind a separate Sign-in screen
 * (app/settings/account.tsx, retired 2026-07-22); nothing routes there anymore.
 *
 * The security property that moved with them: a password CHANGE reauthenticates
 * before updateUser, because updateUser never checks the old password on its
 * own. An account with no password (Apple/OAuth only) has nothing to prove, so
 * ADDING one asks for no current password. Which case we are in is read off the
 * account's providers, never guessed.
 */
export default function ProfileScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const { user, initialized, loading } = useAuth();
  const { showSuccess, showError } = useNotification();
  const supabase = getSupabaseClient();

  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Transient form state only — nothing here outlives the screen, so Zustand
  // slices stay for persistent data. The email field is a draft laid over the
  // real address: null means "showing what is on file" (a smart default the
  // user can edit in place rather than a second empty box).
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOutcome, setEmailOutcome] = useState<EmailChangeOutcome | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  // The email reads as a greyed, on-file value until the user taps it to edit —
  // a smart default (show what's there) over a second empty box.
  const [emailEditing, setEmailEditing] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  // Identities on the cached session stay stale until the next refresh, so a
  // password added in this session is remembered locally. It only ever makes
  // the screen ASK for more (reauth), never less.
  const [passwordJustAdded, setPasswordJustAdded] = useState(false);

  const userEmail = user?.email ?? null;
  const emailValue = emailDraft ?? userEmail ?? '';
  const emailUnchanged =
    !emailValue.trim() || emailValue.trim().toLowerCase() === (userEmail ?? '').trim().toLowerCase();
  const hasPassword = hasPasswordIdentity(user) || passwordJustAdded;
  const awaitingConfirmation = pendingEmailOf(user);

  // --- Pre-fill display name from the saved profile (same read pattern as
  // app/(tabs)/settings.tsx). Field stays disabled while loading so there is
  // no flash of an editable-empty input; a fetch error falls back to the
  // signup auth metadata and, failing that, an editable empty field.
  useEffect(() => {
    if (!user?.id) {
      setLoadingProfile(false);
      return;
    }
    let cancelled = false;
    (async () => {
      let savedName: string | null = null;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        savedName = data?.display_name ?? null;
      } catch (err) {
        // Non-blocking: metadata fallback below still applies; save still works.
        logger.warn('[Profile] could not load saved profile:', err);
      }
      if (cancelled) return;
      const initialName = resolveInitialDisplayName(savedName, user.user_metadata);
      if (initialName) {
        setDisplayName(prev => (prev ? prev : initialName));
      }
      setLoadingProfile(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.user_metadata, supabase]);

  // --- Pre-load the existing avatar (same source as settings.tsx).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await getAvatarUrl(user.id, 3600);
        if (cancelled || !url) return;
        setAvatarUri(prev => prev ?? url);
      } catch {
        // Non-blocking: placeholder avatar remains.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pickImage = useCallback(async () => {
    if (!user?.id) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const prev = avatarUri;
      setAvatarUri(uri);
      try {
        await uploadAvatar(user.id, uri);
      } catch (e) {
        setAvatarUri(prev);
        showError(e instanceof Error ? e.message : 'Could not upload avatar.');
      }
    }
    // showError is a stable context callback and is deliberately left out:
    // listing it makes the React compiler drop this memo entirely.
  }, [user?.id, avatarUri]);

  const handleSave = async () => {
    if (!user?.id || !displayName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName.trim() });
      if (error) throw error;
      showSuccess('Profile updated.');
    } catch (err) {
      logger.error('[Profile] save error:', err);
      showError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailChange = useCallback(async () => {
    if (savingEmail) return;
    setEmailOutcome(null);
    const problem = validateEmailChange(emailValue, userEmail);
    if (problem) {
      setEmailError(problem);
      return;
    }
    setEmailError(null);
    setSavingEmail(true);
    try {
      const target = emailValue.trim();
      const { data, error } = await supabase.auth.updateUser({ email: target });
      if (error) {
        setEmailError(mapEmailChangeError(error));
        return;
      }
      // Honest by construction: "Confirm email" may be off on this project, in
      // which case the address is already live and no mail was ever sent.
      const outcome = describeEmailChangeOutcome(data?.user, target);
      setEmailOutcome(outcome);
      setEmailDraft(null);
      // Submit succeeded — collapse back to the calm on-file view. The outcome
      // line (and the pending block for a confirmation flow) still shows below.
      setEmailEditing(false);
      if (outcome.status === 'applied') showSuccess('Your email is updated.');
    } catch (e) {
      logger.error('[Profile] email change threw:', e);
      setEmailError(mapEmailChangeError(e as { message?: string }));
    } finally {
      setSavingEmail(false);
    }
  }, [emailValue, savingEmail, supabase, userEmail, showSuccess]);

  const startEmailEdit = useCallback(() => {
    setEmailEditing(true);
    setEmailError(null);
    setEmailOutcome(null);
  }, []);

  const cancelEmailEdit = useCallback(() => {
    setEmailEditing(false);
    setEmailDraft(null);
    setEmailError(null);
    setEmailOutcome(null);
  }, []);

  const handlePasswordSubmit = useCallback(async () => {
    if (savingPassword) return;
    const problem = hasPassword
      ? validatePasswordChange({ currentPassword, newPassword, confirmPassword })
      : validateNewPassword({ newPassword, confirmPassword });
    if (problem) {
      setPasswordError(problem);
      return;
    }
    if (hasPassword && !userEmail) {
      setPasswordError('We could not read your email, so we cannot confirm it is you.');
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    try {
      if (hasPassword) {
        // Proof of ownership. updateUser alone never checks the old password, so
        // a live session on an unlocked phone would be enough without this.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: userEmail as string,
          password: currentPassword,
        });
        if (reauthError) {
          setPasswordError(mapReauthError(reauthError));
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(mapPasswordChangeError(error));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (!hasPassword) setPasswordJustAdded(true);
      showSuccess(hasPassword ? 'Your password is updated.' : 'Your password is set.');
    } catch (e) {
      logger.error('[Profile] password write threw:', e);
      setPasswordError(mapPasswordChangeError(e as { message?: string }));
      showError('We could not save your password. Please try again.');
    } finally {
      setSavingPassword(false);
    }
  }, [
    confirmPassword,
    currentPassword,
    hasPassword,
    newPassword,
    savingPassword,
    supabase,
    userEmail,
    showSuccess,
    showError,
  ]);

  if (!initialized || loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.linen }]}>
        <LivraHeader showBack title="Edit Profile" />
        <View style={styles.content}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, styles.skeleton]} />
          </View>
          <View style={[styles.skeletonBar, styles.skeleton]} />
          <View style={[styles.skeletonInput, styles.skeleton]} />
          <View style={[styles.skeletonBar, styles.skeleton]} />
          <View style={[styles.skeletonInput, styles.skeleton]} />
          <Text style={styles.quietLine}>Reading your account…</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, { backgroundColor: c.linen }]}>
        <LivraHeader showBack title="Edit Profile" />
        <View style={styles.centered}>
          <Text style={styles.quietLine}>
            You are signed out. Sign in again to edit your profile, email and password.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Edit Profile" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Opacity-only entrance: this is already the reduced-motion form of
              the transition, so it needs no separate degraded path. */}
          <Animated.View entering={FadeIn.duration(240)}>
            <View style={styles.avatarRow}>
              <TouchableOpacity style={styles.avatarWrap} onPress={pickImage} activeOpacity={0.8}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <User size={28} color={c.inkMuted} weight="duotone" />
                  </View>
                )}
                <View style={[styles.cameraChip, { backgroundColor: c.forest }]}>
                  <Camera size={14} color={c.inkInverse} weight="fill" />
                </View>
              </TouchableOpacity>
            </View>

            {/* One clean workflow, no card chrome: Name, Email, Password stacked
                as a single form. Explanatory text stays out of the way — it only
                appears on error/outcome or the confirmation pending state. */}
            <View style={styles.fieldBlock}>
              <SectionLabel>NAME</SectionLabel>
              <TextInput
                style={[styles.input, loadingProfile && styles.inputDisabled]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={loadingProfile ? 'Loading…' : 'How you appear in the app'}
                placeholderTextColor={c.inkMuted}
                autoCapitalize="words"
                editable={!loadingProfile}
              />
            </View>

            <PillButton
              label={saving ? 'Saving…' : 'Save changes'}
              onPress={handleSave}
              disabled={saving || !displayName.trim()}
              style={styles.saveBtn}
            />

            {/* ── Email ── greyed on-file value; tap to edit. No standing copy. */}
            <SectionLabel style={styles.groupLabel}>EMAIL</SectionLabel>

            {emailEditing ? (
              <>
                <TextInput
                  style={styles.input}
                  value={emailValue}
                  onChangeText={(t) => {
                    setEmailDraft(t);
                    setEmailError(null);
                    setEmailOutcome(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={c.inkMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!savingEmail}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => { void handleEmailChange(); }}
                />
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                <View style={styles.actionRow}>
                  <PillButton
                    variant="ghost"
                    label={savingEmail ? 'Saving…' : 'Update email'}
                    onPress={() => { void handleEmailChange(); }}
                    disabled={savingEmail || emailUnchanged}
                    style={styles.actionFlex}
                  />
                  <TouchableOpacity onPress={cancelEmailEdit} hitSlop={8} disabled={savingEmail}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.input, styles.readonlyField]}
                onPress={startEmailEdit}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Email ${userEmail ?? 'not set'}. Tap to edit.`}
              >
                <Text
                  style={[styles.readonlyValue, !userEmail && { color: c.inkMid }]}
                  numberOfLines={1}
                >
                  {userEmail ?? 'Add an email'}
                </Text>
                <PencilSimple size={16} color={c.inkMid} weight="regular" />
              </TouchableOpacity>
            )}

            {emailOutcome ? (
              <Animated.Text entering={FadeIn.duration(160)} style={styles.outcomeText}>
                {emailOutcome.message}
              </Animated.Text>
            ) : null}
            {awaitingConfirmation ? (
              <Text style={styles.pendingText}>
                Waiting on {awaitingConfirmation}. Open the confirmation link we sent there and this
                screen will show the new address.
              </Text>
            ) : null}

            {/* ── Password ── minimal: placeholders carry the labels. */}
            <SectionLabel style={styles.groupLabel}>PASSWORD</SectionLabel>

            {hasPassword ? (
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={(t) => { setCurrentPassword(t); setPasswordError(null); }}
                placeholder="Current password"
                placeholderTextColor={c.inkMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingPassword}
                textContentType="password"
              />
            ) : null}

            <TextInput
              style={[styles.input, styles.stackedInput]}
              value={newPassword}
              onChangeText={(t) => { setNewPassword(t); setPasswordError(null); }}
              placeholder={hasPassword ? 'New password' : 'Password — at least 8 characters'}
              placeholderTextColor={c.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              editable={!savingPassword}
              textContentType="newPassword"
            />

            <TextInput
              style={[styles.input, styles.stackedInput]}
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setPasswordError(null); }}
              placeholder={hasPassword ? 'Repeat new password' : 'Repeat password'}
              placeholderTextColor={c.inkMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!savingPassword}
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={() => { void handlePasswordSubmit(); }}
            />

            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <PillButton
              variant="ghost"
              label={
                savingPassword
                  ? 'Saving…'
                  : hasPassword
                    ? 'Change password'
                    : 'Set password'
              }
              onPress={() => { void handlePasswordSubmit(); }}
              disabled={
                savingPassword ||
                (hasPassword && !currentPassword.trim()) ||
                !newPassword ||
                !confirmPassword
              }
              style={styles.action}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
    screen: { flex: 1 },
    flex: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    // inkMid, never inkMuted: this line is sometimes the entire content of the
    // screen (the signed-out state), and inkMuted on linen is 2.43:1.
    quietLine: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkMid,
      textAlign: 'center',
      lineHeight: 22,
    },
    avatarRow: {
      alignItems: 'center',
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    avatarPlaceholder: {
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraChip: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skeleton: { backgroundColor: c.surfaceAlt },
    skeletonBar: {
      height: 12,
      width: 120,
      borderRadius: radius.sm,
      marginTop: spacing.xl,
    },
    skeletonInput: {
      height: 48,
      borderRadius: radius.md,
      marginTop: spacing.xs,
    },
    fieldBlock: {
      marginTop: spacing.xl,
      gap: spacing.xs,
    },
    // Section labels below the first one get breathing room above so Name,
    // Email and Password read as three calm groups in one flat form.
    groupLabel: { marginTop: spacing.xl },
    input: {
      height: 48,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkDark,
      borderWidth: 1,
      borderColor: c.borderLight,
      justifyContent: 'center',
    },
    inputDisabled: { opacity: 0.6 },
    // Stacked password fields sit tight to each other (one xs gap), reading as
    // one group rather than three peers.
    stackedInput: { marginTop: spacing.sm },
    // The email in its resting state: a field-shaped row showing the on-file
    // address with a pencil affordance. Row layout over the shared input shell.
    readonlyField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    readonlyValue: {
      flex: 1,
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkDark,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    actionFlex: { flex: 1 },
    cancelText: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.md,
      color: c.inkMid,
      paddingHorizontal: spacing.sm,
    },
    // 13px carries no large-text allowance, so inkMid (8.47:1) not inkMuted.
    pendingText: {
      fontFamily: fonts.sans,
      fontSize: fontSize[13],
      color: c.inkMid,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
    errorText: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      color: c.danger,
      marginTop: spacing.xs,
    },
    outcomeText: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.sm,
      color: c.accent,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
    action: { marginTop: spacing.md },
    // Asymmetric on purpose: md above ties it to the field it saves, and the
    // zone seam supplies the xxl below.
    saveBtn: {
      marginTop: spacing.md,
    },
  });
}
