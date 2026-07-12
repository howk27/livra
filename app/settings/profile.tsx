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
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { User, Camera } from 'phosphor-react-native';
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

export default function ProfileScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

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
        Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload avatar.');
      }
    }
  }, [user?.id, avatarUri]);

  const handleSave = async () => {
    if (!user?.id || !displayName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName.trim() });
      if (error) throw error;
      Alert.alert('Saved', 'Profile updated.');
    } catch (err) {
      logger.error('[Profile] save error:', err);
      Alert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Edit Profile" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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

          <View style={styles.fieldBlock}>
            <SectionLabel>DISPLAY NAME</SectionLabel>
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

          <View style={styles.fieldBlock}>
            <SectionLabel>EMAIL</SectionLabel>
            <View style={[styles.input, styles.inputDisabled]}>
              <Text style={[styles.inputText, { color: c.inkMuted }]}>
                {user?.email ?? '—'}
              </Text>
            </View>
          </View>

          <PillButton
            label={saving ? 'Saving…' : 'Save Changes'}
            onPress={handleSave}
            disabled={saving || !displayName.trim()}
            style={styles.saveBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
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
    fieldBlock: {
      marginTop: spacing.xl,
      gap: spacing.xs,
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
      justifyContent: 'center',
    },
    inputDisabled: { opacity: 0.6 },
    inputText: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
    },
    saveBtn: {
      marginTop: spacing.xxl,
    },
  });
}
