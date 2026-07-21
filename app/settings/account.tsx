import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AppleLogo, Envelope, Lock } from 'phosphor-react-native';

import { LivraHeader } from '../../components/ui/LivraHeader';
import { PillButton } from '../../components/ui/PillButton';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { themedColors, fonts, spacing, radius, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useAuth } from '../../hooks/useAuth';
import { getSupabaseClient } from '../../lib/supabase';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import {
  describeEmailChangeOutcome,
  hasPasswordIdentity,
  isApplePrivateRelayEmail,
  mapEmailChangeError,
  mapPasswordChangeError,
  mapReauthError,
  pendingEmail as pendingEmailOf,
  validateEmailChange,
  validatePasswordChange,
  type EmailChangeOutcome,
} from '../../lib/auth/accountCredentials';

export default function AccountScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const { user, initialized, loading } = useAuth();
  const { showSuccess, showError } = useNotification();
  const supabase = getSupabaseClient();

  // Transient form state only. Nothing here is persistent data, so useState is
  // the right home for it (Zustand slices stay for anything that outlives the
  // screen). The pending email banner is derived from the session user instead.
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailOutcome, setEmailOutcome] = useState<EmailChangeOutcome | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const userEmail = user?.email ?? null;
  const canUsePassword = hasPasswordIdentity(user);
  const onPrivateRelay = isApplePrivateRelayEmail(user?.email);
  const awaitingConfirmation = pendingEmailOf(user);

  const handleEmailChange = useCallback(async () => {
    if (savingEmail) return;
    setEmailOutcome(null);
    const problem = validateEmailChange(newEmail, userEmail);
    if (problem) {
      setEmailError(problem);
      return;
    }
    setEmailError(null);
    setSavingEmail(true);
    try {
      const target = newEmail.trim();
      const { data, error } = await supabase.auth.updateUser({ email: target });
      if (error) {
        setEmailError(mapEmailChangeError(error));
        return;
      }
      // Honest by construction: "Confirm email" may be off on this project, in
      // which case the address is already live and no mail was ever sent.
      const outcome = describeEmailChangeOutcome(data?.user, target);
      setEmailOutcome(outcome);
      setNewEmail('');
      if (outcome.status === 'applied') showSuccess('Your email is updated.');
    } catch (e) {
      logger.error('[Account] email change threw:', e);
      setEmailError(mapEmailChangeError(e as { message?: string }));
    } finally {
      setSavingEmail(false);
    }
  }, [newEmail, savingEmail, supabase, userEmail, showSuccess]);

  const handlePasswordChange = useCallback(async () => {
    if (savingPassword) return;
    const problem = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (problem) {
      setPasswordError(problem);
      return;
    }
    if (!userEmail) {
      setPasswordError('We could not read your email, so we cannot confirm it is you.');
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    try {
      // Proof of ownership. updateUser alone never checks the old password, so
      // a live session on an unlocked phone would be enough without this.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });
      if (reauthError) {
        setPasswordError(mapReauthError(reauthError));
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(mapPasswordChangeError(error));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccess('Your password is updated.');
    } catch (e) {
      logger.error('[Account] password change threw:', e);
      setPasswordError(mapPasswordChangeError(e as { message?: string }));
      showError('We could not change your password. Please try again.');
    } finally {
      setSavingPassword(false);
    }
  }, [
    confirmPassword,
    currentPassword,
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
        <LivraHeader showBack title="Sign-in" />
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} />
          <Text style={styles.quietLine}>Reading your account…</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.screen, { backgroundColor: c.linen }]}>
        <LivraHeader showBack title="Sign-in" />
        <View style={styles.centered}>
          <Text style={styles.quietLine}>
            You are signed out. Sign in again to manage your email and password.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Sign-in" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── EMAIL ─────────────────────────────────────────────────── */}
          <SectionLabel>EMAIL</SectionLabel>

          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <Envelope size={18} color={c.inkMid} weight="regular" />
              <Text style={styles.cardHeadText}>{user.email ?? 'No email on file'}</Text>
            </View>

            {onPrivateRelay ? (
              <Text style={styles.note}>
                Apple keeps your real address hidden behind a relay. Setting your own email
                means account mail reaches you directly.
              </Text>
            ) : null}

            {awaitingConfirmation ? (
              <View style={styles.pendingBlock}>
                <Text style={styles.pendingText}>
                  Waiting on {awaitingConfirmation}. Open the confirmation link we sent there
                  and this screen will show the new address.
                </Text>
              </View>
            ) : null}

            <Text style={styles.label}>New email</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={(t) => {
                setNewEmail(t);
                setEmailError(null);
                setEmailOutcome(null);
              }}
              placeholder="you@example.com"
              placeholderTextColor={c.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!savingEmail}
              returnKeyType="done"
              onSubmitEditing={() => { void handleEmailChange(); }}
            />

            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            {emailOutcome ? <Text style={styles.outcomeText}>{emailOutcome.message}</Text> : null}

            <PillButton
              label={savingEmail ? 'Saving…' : 'Update email'}
              onPress={() => { void handleEmailChange(); }}
              disabled={savingEmail || !newEmail.trim()}
              style={styles.action}
            />
          </View>

          {/* ── PASSWORD ──────────────────────────────────────────────── */}
          <SectionLabel style={styles.sectionSpacer}>PASSWORD</SectionLabel>

          {canUsePassword ? (
            <View style={styles.card}>
              <View style={styles.cardHeadRow}>
                <Lock size={18} color={c.inkMid} weight="regular" />
                <Text style={styles.cardHeadText}>Change your password</Text>
              </View>

              <Text style={styles.label}>Current password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={(t) => { setCurrentPassword(t); setPasswordError(null); }}
                placeholder="Your current password"
                placeholderTextColor={c.inkMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingPassword}
                textContentType="password"
              />

              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={(t) => { setNewPassword(t); setPasswordError(null); }}
                placeholder="At least 8 characters"
                placeholderTextColor={c.inkMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingPassword}
                textContentType="newPassword"
              />

              <Text style={styles.label}>Repeat new password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); setPasswordError(null); }}
                placeholder="Repeat it once more"
                placeholderTextColor={c.inkMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!savingPassword}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={() => { void handlePasswordChange(); }}
              />

              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              <Text style={styles.note}>
                We ask for your current password first, so only you can change it.
              </Text>

              <PillButton
                label={savingPassword ? 'Saving…' : 'Change password'}
                onPress={() => { void handlePasswordChange(); }}
                disabled={
                  savingPassword ||
                  !currentPassword.trim() ||
                  !newPassword ||
                  !confirmPassword
                }
                style={styles.action}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHeadRow}>
                <AppleLogo size={18} color={c.inkMid} weight="regular" />
                <Text style={styles.cardHeadText}>You sign in with Apple</Text>
              </View>
              <Text style={styles.note}>
                There is no password on this account, so there is nothing to change here.
                Apple looks after your sign-in.
              </Text>
            </View>
          )}
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
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    quietLine: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.borderLight,
      padding: spacing.md,
      marginTop: spacing.xs,
      gap: spacing.xs,
    },
    cardHeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    cardHeadText: {
      flex: 1,
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.md,
      color: c.inkDark,
    },
    sectionSpacer: { marginTop: spacing.xl },
    label: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.sm,
      color: c.inkMid,
      marginTop: spacing.sm,
    },
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
    },
    note: {
      fontFamily: fonts.sans,
      fontSize: fontSize[13],
      color: c.inkMuted,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
    pendingBlock: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.xs,
    },
    pendingText: {
      fontFamily: fonts.sans,
      fontSize: fontSize[13],
      color: c.inkMid,
      lineHeight: 19,
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
  });
}
