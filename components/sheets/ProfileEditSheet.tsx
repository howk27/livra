import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, User, Camera } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { PillButton } from '../ui/PillButton';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, fonts, spacing, radius, fontSize } from '../../theme/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../contexts/NotificationContext';
import { uploadAvatar } from '../../lib/storage/avatarStorage';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
const DURATION = 300;

interface ProfileEditSheetProps {
  visible: boolean;
  onClose: () => void;
  initialName?: string;
  initialDisplayName?: string;
  initialEmail?: string;
  onSave?: (data: { name: string; displayName: string }) => void;
}

export function ProfileEditSheet({
  visible,
  onClose,
  initialName = '',
  initialDisplayName = '',
  initialEmail = '',
  onSave,
}: ProfileEditSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(SHEET_HEIGHT);
  const overlayOpacity = useSharedValue(0);
  const { user } = useAuth();
  const { showError } = useNotification();

  const [name, setName] = useState(initialName);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: DURATION });
      overlayOpacity.value = withTiming(1, { duration: DURATION });
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, { duration: DURATION });
      overlayOpacity.value = withTiming(0, { duration: DURATION });
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * 0.5,
  }));

  const pickImage = useCallback(async () => {
    if (!user?.id) {
      showError('Sign in to update your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const previousUri = avatarUri;
      setAvatarUri(uri); // optimistic
      try {
        await uploadAvatar(user.id, uri);
      } catch (e: unknown) {
        setAvatarUri(previousUri); // revert on failure
        const message = e instanceof Error ? e.message : 'Failed to upload avatar.';
        showError(message);
      }
    }
  }, [user?.id, avatarUri, showError]);

  const handleSave = () => {
    onSave?.({ name, displayName });
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      {/* Overlay */}
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={20} color={colors.inkMid} weight="bold" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Avatar */}
            <View style={styles.avatarRow}>
              <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
                <View style={styles.avatarCircle}>
                  {avatarUri ? null : <User size={28} color={colors.inkMuted} weight="duotone" />}
                </View>
                <View style={styles.cameraOverlay}>
                  <Camera size={14} color={colors.inkInverse} weight="fill" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Full Name */}
            <View style={styles.fieldGroup}>
              <SectionLabel>Full Name</SectionLabel>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="words"
              />
            </View>

            {/* Display Name */}
            <View style={styles.fieldGroup}>
              <SectionLabel>Display Name</SectionLabel>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Shown in the app"
                placeholderTextColor={colors.inkMuted}
              />
            </View>

            {/* Email (non-editable) */}
            <View style={styles.fieldGroup}>
              <SectionLabel>Email</SectionLabel>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={initialEmail}
                editable={false}
                placeholderTextColor={colors.inkMuted}
              />
              <TouchableOpacity>
                <Text style={styles.changeLink}>Change email</Text>
              </TouchableOpacity>
            </View>

            <PillButton
              label="Save Changes"
              onPress={handleSave}
              fullWidth
              style={styles.saveBtn}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 200,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    zIndex: 201,
    elevation: 20,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMid,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[17],
    color: colors.inkDark,
  },
  content: {
    paddingTop: spacing.lg,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  input: {
    height: 48,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.inkDark,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: spacing.xs,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  changeLink: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
    color: colors.forest,
    marginTop: spacing.xs,
  },
  saveBtn: {
    marginTop: spacing.xl,
  },
});
