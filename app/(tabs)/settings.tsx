import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Image,
  Platform,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import {
  useEffectiveTheme,
  useUIStore,
  ONBOARDING_COMPLETED_STORAGE_KEY,
  ONBOARDING_REMOTE_PENDING_KEY,
} from '../../state/uiSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../hooks/useAuth';
import { generateAllCountersCSV } from '../../lib/csv';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { GradientBackground } from '../../components/GradientBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSyncCursors } from '../../lib/sync/syncCursors';
import { readSyncDiagSnapshot, type SyncDiagSnapshotV1 } from '../../lib/sync/syncDiagSnapshot';
import { AppText } from '../../components/Typography';
import { Card, PrimaryButton } from '../../components/ui';
import { useNotification } from '../../contexts/NotificationContext';
import { LIVRA_REMINDERS_ENABLED_KEY } from '../../lib/notifications/livraReminderPrefs';
import { useCountersStore } from '../../state/countersSlice';
import { logger } from '../../lib/utils/logger';
import { BackupRestoreSection } from '../../components/BackupRestoreSection';
import { toUserMessage } from '../../lib/utils/errorMessages';
import { uploadAvatar, getAvatarUrl, deleteAvatar, refreshAvatarUrl } from '../../lib/storage/avatarStorage';
import { diagEvent } from '../../lib/debug/iapDiagnostics';
import { setDiagnosticsUnlockedPersisted } from '../../lib/dev/diagnosticsUnlock';
import Constants from 'expo-constants';
import { applyOpacity } from '@/src/components/icons/color';
import type { User } from '@supabase/supabase-js';
import {
  userHasEmailPasswordIdentity,
  passwordCredentialNotApplicableMessage,
} from '../../lib/auth/providerHints';

/** Matches `tabBarStyle.height` in `app/(tabs)/_layout.tsx` (64 + safe area); tab bar is absolute so content must pad past it. */
const TAB_BAR_CONTENT_HEIGHT = 64;

function displayNameFromUserMetadata(user: User): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (!meta) return null;
  for (const key of ['full_name', 'name', 'display_name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export default function SettingsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { themeMode, setThemeMode } = useUIStore();
  const { isProUnlocked, proStatus, refreshProStatus } = useIapSubscriptions();
  const { sync, syncState } = useSync();
  const { counters } = useCounters();
  const { events } = useEventsStore();
  const { user, signOut: authSignOut } = useAuth();
  const supabase = getSupabaseClient();
  const { showSuccess, showError } = useNotification();
  const lastSyncErrorRef = useRef<string | null>(null);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const refreshRotation = useRef(new Animated.Value(0)).current;
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationRetryCount, setVerificationRetryCount] = useState(0);
  const [lastResendTime, setLastResendTime] = useState<number | null>(null);
  const [csvExportEmail, setCsvExportEmail] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  /** Last successful core sync + maintenance metadata (AsyncStorage); not tied to this screen's `useSync` instance. */
  const [persistedSyncDiag, setPersistedSyncDiag] = useState<SyncDiagSnapshotV1 | null>(null);

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

  // Hidden gesture for diagnostics (tap version 7 times within 1.5 seconds)
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = () => {
    versionTapCount.current += 1;

    // Clear existing timer
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    // If 7 taps reached, unlock diagnostics (production-safe hidden gesture)
    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
        versionTapTimer.current = null;
      }
      // Log diagnostic event for tracking
      diagEvent('diagnostics_opened_hidden_gesture', { 
        threshold: 7, 
        screen: 'diagnostics' 
      });
      // Persist unlock for diagnostics access
      void setDiagnosticsUnlockedPersisted(true);
      router.push('/diagnostics' as Href);
      return;
    }

    // Reset counter after 1.5 seconds of inactivity
    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  };
  
  useEffect(() => {
    if (!user?.id) {
      setProfileDisplayName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          logger.warn('[Profile] Could not load display_name:', error.message);
          setProfileDisplayName(null);
          return;
        }
        const n = data?.display_name?.trim();
        setProfileDisplayName(n || null);
      } catch {
        if (!cancelled) setProfileDisplayName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase]);

  const profileName = useMemo(() => {
    if (!user) return 'Guest user';
    if (profileDisplayName) return profileDisplayName;
    const fromMeta = displayNameFromUserMetadata(user);
    if (fromMeta) return fromMeta;
    return user.email ?? 'Guest user';
  }, [user, profileDisplayName]);

  const profileHint = user
    ? 'Signed in and ready to sync.'
    : 'Sign in to sync safely across devices.';

  // Load profile image on mount and when user changes
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        if (user?.id) {
          // If user is logged in, try to load from Supabase storage
          const avatarUrl = await getAvatarUrl(user.id, 3600); // 1 hour expiry
          
          if (avatarUrl) {
            setProfileImageUri(avatarUrl);
            // Also store locally as cache
            await AsyncStorage.setItem('profile_image_uri', avatarUrl);
            return;
          }
          
          // If not found in Supabase, check local storage as fallback
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            // Only use local URI if it's a file path (not a URL)
            setProfileImageUri(storedUri);
          } else if (storedUri && storedUri.startsWith('http')) {
            // Try to refresh expired signed URL
            const refreshedUrl = await refreshAvatarUrl(user.id, storedUri, 3600);
            if (refreshedUrl) {
              setProfileImageUri(refreshedUrl);
              await AsyncStorage.setItem('profile_image_uri', refreshedUrl);
            } else {
              // URL expired and refresh failed, clear it
              await AsyncStorage.removeItem('profile_image_uri');
              setProfileImageUri(null);
            }
          }
        } else {
          // If not logged in, use local storage only
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            setProfileImageUri(storedUri);
          }
        }
      } catch (error) {
        logger.error('Error loading profile image:', error);
        // Fallback to local storage
        try {
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            setProfileImageUri(storedUri);
          }
        } catch (fallbackError) {
          logger.error('Error loading from local storage:', fallbackError);
        }
      }
    };
    loadProfileImage();
  }, [user?.id]);

  // Check email verification status
  // CRITICAL: This only checks auth status - it does NOT trigger sync or loadMarks
  // It's safe and won't interfere with mark updates
  useEffect(() => {
    const checkEmailVerification = async () => {
      if (!user) {
        setIsEmailVerified(null);
        return;
      }

      try {
        // Refresh user data to get latest verification status
        // This is a lightweight auth check - does NOT affect marks or counters
        const { data: { user: refreshedUser }, error: refreshError } = await supabase.auth.getUser();
        if (refreshError) {
          logger.error('Error refreshing user data:', refreshError);
          return;
        }
        
        if (refreshedUser) {
          const refreshedVerified = !!(refreshedUser.email_confirmed_at || refreshedUser.confirmed_at);
          setIsEmailVerified(refreshedVerified);
          
          // If verified, reset retry count
          if (refreshedVerified) {
            setVerificationRetryCount(0);
            setLastResendTime(null);
          }
        }
      } catch (error) {
        logger.error('Error checking email verification:', error);
        // Don't change status on error - keep current state
        // This error does NOT affect marks or counters
      }
    };

    checkEmailVerification();
  }, [user?.id, user?.email_confirmed_at, user?.confirmed_at, supabase]);

  // Automatic polling for email verification status when unverified
  useEffect(() => {
    // Only poll if email is not verified
    if (isEmailVerified !== false || !user) {
      return;
    }

    // Poll every 10 seconds to check for verification
    // CRITICAL: This polling does NOT interfere with mark updates - it only checks auth status
    // It does NOT trigger sync or loadMarks, so it's safe
    const interval = setInterval(async () => {
      try {
        const { data: { user: refreshedUser } } = await supabase.auth.getUser();
        if (refreshedUser) {
          const refreshedVerified = !!(refreshedUser.email_confirmed_at || refreshedUser.confirmed_at);
          if (refreshedVerified) {
            setIsEmailVerified(true);
            setVerificationRetryCount(0);
            setLastResendTime(null);
          }
        }
      } catch (error) {
        logger.error('Error polling verification status:', error);
        // Don't let verification polling errors affect the app
      }
    }, 10000); // Check every 10 seconds

    return () => {
      clearInterval(interval);
    };
  }, [isEmailVerified, user]);

  const canUsePasswordChange = useMemo(() => userHasEmailPasswordIdentity(user), [user]);

  const openChangePasswordUi = () => {
    if (!canUsePasswordChange) {
      Alert.alert('Password change unavailable', passwordCredentialNotApplicableMessage());
      return;
    }
    if (!user?.email?.trim()) {
      Alert.alert(
        'Email required',
        'We could not find an email address for password verification. Sign out and use Sign in with Apple, or contact support if you use email and this persists.',
      );
      return;
    }
    setChangePasswordModalVisible(true);
  };

  const handleSignIn = () => {
    router.push('/auth/signin');
  };

  const handleResendVerificationEmail = async (retryAttempt: number = 0) => {
    if (!user?.email) {
      showError('No email address found');
      return;
    }

    // Calculate exponential backoff delay (1s, 2s, 4s, 8s, max 30s)
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, retryAttempt), maxDelay);
    
    // Check if we need to wait before retrying
    if (retryAttempt > 0 && lastResendTime) {
      const timeSinceLastResend = Date.now() - lastResendTime;
      if (timeSinceLastResend < delay) {
        const remainingTime = Math.ceil((delay - timeSinceLastResend) / 1000);
        showError(`Please wait ${remainingTime} second${remainingTime !== 1 ? 's' : ''} before requesting another email.`);
        return;
      }
    }

    setIsResendingVerification(true);
    try {
      // Supabase resend verification email
      // Try multiple approaches to ensure email is sent
      logger.log('[Resend Verification] Attempting to resend verification email to:', '[redacted]');
      
      let { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });

      // If signup type fails, try again with signup type (Supabase only supports 'signup' for email verification)
      if (error) {
        logger.warn('[Resend Verification] First attempt failed, retrying:', error.message);
        const retryResult = await supabase.auth.resend({
          type: 'signup',
          email: user.email,
        });
        if (!retryResult.error) {
          logger.log('[Resend Verification] Retry succeeded');
          data = retryResult.data;
          error = null;
        } else {
          logger.error('[Resend Verification] Retry also failed:', retryResult.error);
          error = retryResult.error;
        }
      } else {
        logger.log('[Resend Verification] Signup type succeeded');
      }

      if (error) {
        logger.error('Error resending verification email:', error, {
          errorCode: error.code,
          errorMessage: error.message,
          errorStatus: error.status,
        });
        
        // Check if error is because user is already verified
        if (error.message?.includes('already verified') || error.message?.includes('already confirmed')) {
          // Refresh user data to update verification status
          const { data: { user: refreshedUser } } = await supabase.auth.getUser();
          if (refreshedUser) {
            const isVerified = !!(refreshedUser.email_confirmed_at || refreshedUser.confirmed_at);
            setIsEmailVerified(isVerified);
          }
          showSuccess('Your email is already verified!');
          setVerificationRetryCount(0);
          setLastResendTime(null);
        } else if (error.message?.includes('rate limit') || error.message?.includes('too many requests')) {
          // Handle rate limiting with retry
          const newRetryCount = verificationRetryCount + 1;
          setVerificationRetryCount(newRetryCount);
          setLastResendTime(Date.now());
          
          if (retryAttempt < 3) {
            // Retry with exponential backoff
            showError(`Too many requests. Retrying in ${Math.ceil(delay / 1000)} seconds...`);
            setTimeout(() => {
              handleResendVerificationEmail(retryAttempt + 1);
            }, delay);
          } else {
            showError('Too many verification requests. Please wait a few minutes before trying again.');
          }
        } else {
          // Other errors - retry with exponential backoff
          const newRetryCount = verificationRetryCount + 1;
          setVerificationRetryCount(newRetryCount);
          setLastResendTime(Date.now());
          
          if (retryAttempt < 3) {
            showError(`Failed to send email. Retrying... (${retryAttempt + 1}/3)`);
            setTimeout(() => {
              handleResendVerificationEmail(retryAttempt + 1);
            }, delay);
          } else {
          showError(toUserMessage(error, 'Failed to send verification email after multiple attempts. Please try again later.'));
            setVerificationRetryCount(0);
          }
        }
      } else {
        // Success
        const newRetryCount = verificationRetryCount + 1;
        setVerificationRetryCount(newRetryCount);
        setLastResendTime(Date.now());
        
        showSuccess(
          `Verification email sent! ${newRetryCount > 1 ? `(Attempt ${newRetryCount})` : ''} Please check your inbox and spam folder.`
        );
        
        // Start polling for verification status
        // The useEffect will handle the polling automatically
      }
    } catch (error: any) {
      logger.error('Error resending verification email:', error);
      const newRetryCount = verificationRetryCount + 1;
      setVerificationRetryCount(newRetryCount);
      setLastResendTime(Date.now());
      
      if (retryAttempt < 3) {
        showError(`Network error. Retrying... (${retryAttempt + 1}/3)`);
        setTimeout(() => {
          handleResendVerificationEmail(retryAttempt + 1);
        }, delay);
      } else {
        showError('Failed to send verification email after multiple attempts. Please check your internet connection and try again.');
        setVerificationRetryCount(0);
      }
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Clear sync timestamp so next login pulls all data fresh
              await clearSyncCursors();

              // CRITICAL: Clear pro_unlocked to prevent next user from inheriting premium status
              // Premium status should be re-verified from database on next login
              await AsyncStorage.removeItem('pro_unlocked');
              
              // Navigate to signing out screen (it will handle the actual sign out)
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

  const handlePickImage = async () => {
    try {
      // Build alert options
      const options: any[] = [
        {
          text: 'Take Photo',
          onPress: async () => {
            await handleTakePhoto();
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            await handleChooseFromGallery();
          },
        },
      ];

      // Add "Remove Photo" option if there's already a photo
      if (profileImageUri) {
        options.push({
          text: 'Remove Photo',
          style: 'destructive',
          onPress: async () => {
            await handleRemoveImage();
          },
        });
      }

      // Add cancel option
      options.push({
        text: 'Cancel',
        style: 'cancel',
      });

      // Show action sheet
      Alert.alert(
        profileImageUri ? 'Profile Picture' : 'Select Profile Picture',
        profileImageUri ? 'Choose an option' : 'Choose an option',
        options
      );
    } catch (error: any) {
      logger.error('Error showing image picker options:', error);
      showError('Failed to open image picker. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request camera permission
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== 'granted') {
        Alert.alert('Permission Required', 'We need access to your camera to take a photo.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await processSelectedImage(result.assets[0].uri);
      }
    } catch (error: any) {
      logger.error('Error taking photo:', error);
      showError('Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      // Request gallery permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need access to your photos to set a profile picture.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await processSelectedImage(result.assets[0].uri);
      }
    } catch (error: any) {
      logger.error('Error choosing from gallery:', error);
      showError('Failed to pick image. Please try again.');
    }
  };

  const processSelectedImage = async (uri: string) => {
    try {
      // Show the image immediately for better UX
      setProfileImageUri(uri);
      
      if (user?.id) {
        // Upload to Supabase storage using helper function
        try {
          const avatarUrl = await uploadAvatar(user.id, uri);
          
          if (avatarUrl) {
            setProfileImageUri(avatarUrl);
            await AsyncStorage.setItem('profile_image_uri', avatarUrl);
            showSuccess('Profile picture updated and synced!');
          } else {
            // Upload failed, but still store locally as fallback
            await AsyncStorage.setItem('profile_image_uri', uri);
            showError('Upload failed, saved locally only.');
          }
        } catch (uploadError: any) {
          logger.error('Error uploading to Supabase:', uploadError);
          // Fallback to local storage
          await AsyncStorage.setItem('profile_image_uri', uri);
          showSuccess('Profile picture updated (local only).');
        }
      } else {
        // Not logged in, just store locally
        await AsyncStorage.setItem('profile_image_uri', uri);
        showSuccess('Profile picture updated! Sign in to sync across devices.');
      }
    } catch (error: any) {
      logger.error('Error processing image:', error);
      showError('Failed to process image. Please try again.');
    }
  };

  const handleRemoveImage = async () => {
    try {
      if (user?.id) {
        // Delete from Supabase storage using helper function
        const deleted = await deleteAvatar(user.id);
        
        if (!deleted) {
          logger.error('Error deleting from Supabase');
          // Continue to remove locally anyway
        }
      }
      
      setProfileImageUri(null);
      await AsyncStorage.removeItem('profile_image_uri');
      showSuccess('Profile picture removed!');
    } catch (error: any) {
      logger.error('Error removing image:', error);
      showError('Failed to remove image. Please try again.');
    }
  };

  const handleExportCSV = async () => {
    if (!isProUnlocked && proStatus.verification === 'unverified' && proStatus.status === 'unknown') {
      Alert.alert(
        'Unable to Verify Subscription',
        'We could not verify your subscription status right now. Please check your connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retry',
            onPress: async () => {
              try {
                await refreshProStatus();
              } catch (error) {
                logger.error('[Settings] Error refreshing pro status:', error);
                showError('Unable to refresh subscription status. Please try again.');
              }
            },
          },
        ]
      );
      return;
    }
    if (!isProUnlocked) {
      Alert.alert(
        'Premium Feature',
        'CSV export via email is a Livra+ feature. Upgrade to unlock this and more!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }

    // Show in-app modal for email input
    const defaultEmail = user?.email || csvExportEmail || '';
    setCsvExportEmail(defaultEmail);
    setShowEmailInput(true);
  };


  const performCSVExport = async (recipientEmail?: string) => {
    try {
      const eventsMap = new Map();
      counters.forEach((counter) => {
        eventsMap.set(
          counter.id,
          events.filter((e) => e.mark_id === counter.id)
        );
      });

      const csv = generateAllCountersCSV(counters, eventsMap);
      const fileName = `livra-export-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Create a temporary file for email attachment
      // Use a platform-appropriate temporary directory
      let fileUri: string;
      try {
        // Try to get cache directory (works on most platforms)
        const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
        fileUri = cacheDir ? `${cacheDir}${fileName}` : `file:///tmp/${fileName}`;
      } catch {
        // Fallback to a simple path
        fileUri = `file:///tmp/${fileName}`;
      }
      
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: 'utf8',
      });

      // Check if mail is available
      const isMailAvailable = await MailComposer.isAvailableAsync();
      
      // Use provided email or the one from state
      const emailToUse = recipientEmail || csvExportEmail || user?.email || '';

      if (isMailAvailable) {
        // Open mail composer with attachment
        await MailComposer.composeAsync({
          subject: `Livra Data Export - ${new Date().toLocaleDateString()}`,
          body: 'Please find your Livra data export attached.',
          recipients: emailToUse ? [emailToUse] : [],
          attachments: [fileUri],
        });
        showSuccess('CSV export opened in email!');
      } else {
        // Fallback to expo-sharing if mail composer is not available
        try {
          const isSharingAvailable = await Sharing.isAvailableAsync();
          if (isSharingAvailable) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'text/csv',
              dialogTitle: 'Share Livra Data Export',
            });
            showSuccess('CSV export shared successfully!');
          } else {
            // If sharing is not available, try native Share API as last resort
            await Share.share({
              message: `Livra Data Export - ${new Date().toLocaleDateString()}\n\nPlease find your Livra data export attached.`,
              title: 'Livra Data Export',
            });
            showSuccess('CSV export shared successfully!');
          }
        } catch (shareError: any) {
          // If Share also fails, show the file content or provide alternative
          logger.error('Error sharing CSV:', shareError);
          showError('Unable to share CSV. Please check your device settings.');
        }
      }
    } catch (error: any) {
      logger.error('Error exporting CSV:', error);
      showError(error.message || 'Failed to export CSV. Please try again.');
    }
  };

  const handleSync = async () => {
    try {
      // Start rotation animation
      refreshRotation.setValue(0);
      Animated.loop(
        Animated.timing(refreshRotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();

      await sync();
      showSuccess('Data synced successfully!');
    } catch (error: any) {
      showError(error.message || 'Failed to sync data');
    } finally {
      // Stop rotation animation
      refreshRotation.stopAnimation();
      refreshRotation.setValue(0);
    }
  };

  useEffect(() => {
    if (!syncState.error) {
      lastSyncErrorRef.current = null;
      return;
    }
    if (lastSyncErrorRef.current === syncState.error) return;
    lastSyncErrorRef.current = syncState.error;
    showError(syncState.error);
  }, [syncState.error, showError]);

  const handleChangePassword = async () => {
    if (!canUsePasswordChange) {
      showError(passwordCredentialNotApplicableMessage());
      return;
    }

    const email = user?.email?.trim();
    if (!email) {
      showError(
        'No email is available for this account, so we cannot verify a password. Use Sign in with Apple or contact support.',
      );
      return;
    }

    if (!currentPassword.trim()) {
      showError('Please enter your current password');
      return;
    }

    if (!newPassword.trim()) {
      showError('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verifyError) {
        const msg = verifyError.message?.toLowerCase() ?? '';
        if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
          showError('Current password is incorrect.');
        } else {
          showError(toUserMessage(verifyError, 'Could not verify your current password. Try again.'));
        }
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        showError(toUserMessage(updateError, 'Failed to update password'));
      } else {
        showSuccess('Password updated. Use your new password next time you sign in with email.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsProfileExpanded(false);
        setChangePasswordModalVisible(false);
      }
    } catch (error: unknown) {
      showError(toUserMessage(error, 'Failed to change password'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      showError('User not found');
      return;
    }

    if (isDeletingAccount) {
      return; // Prevent multiple deletion attempts
    }

    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This will permanently delete all your data including counters, events, streaks, and badges. This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Use Alert.prompt for iOS/Android, or show modal for web
            if (Platform.OS === 'web') {
              // For web, we'll use a simple confirmation since Alert.prompt doesn't work
              Alert.alert(
                'Final Confirmation',
                'This is your final chance to cancel. Click "Delete Account" below to permanently delete your account and all data.',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Delete Account',
                    style: 'destructive',
                    onPress: () => performAccountDeletion(),
                  },
                ]
              );
            } else {
              // For iOS/Android, use Alert.prompt to require typing DELETE
              Alert.prompt(
                'Final Confirmation',
                'Type "DELETE" (all caps) in the field below to confirm account deletion. This will permanently remove all your data.',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Delete Account',
                    style: 'destructive',
                    onPress: (inputText?: string) => {
                      if (inputText?.trim() === 'DELETE') {
                        performAccountDeletion();
                      } else {
                        showError('Confirmation text did not match. Account deletion cancelled.');
                      }
                    },
                  },
                ],
                'plain-text'
              );
            }
          },
        },
      ]
    );
  };

  const performAccountDeletion = async () => {
    if (!user?.id || isDeletingAccount) {
      return;
    }

    setIsDeletingAccount(true);

    try {
      try {
        const { disableLivraLocalNotificationsNow } = await import('../../services/livraLocalNotificationOwner');
        await disableLivraLocalNotificationsNow();
      } catch {
        /* ignore */
      }
      // Delete all user data
      await deleteAllUserData(user.id);
      
      // Sign out immediately to prevent hook errors
      // Navigate first, then sign out to avoid component unmount issues
      router.replace('/auth/signin');
      
      // Small delay to ensure navigation completes before sign out
      setTimeout(async () => {
        try {
          await authSignOut();
        } catch (signOutError) {
          logger.error('[Settings] Error signing out after account deletion:', signOutError);
          // Continue anyway - user is already on sign-in screen
        }
      }, 100);
    } catch (error: any) {
      logger.error('[Settings] Error deleting account:', error);
      setIsDeletingAccount(false);
      showError(error.message || 'Failed to delete account. Please try again.');
    }
  };

  const deleteAllUserData = async (userId: string) => {
    try {
      // 1. Delete all user data from Supabase tables
      // Delete counters (cascades to events, streaks, badges via foreign keys)
      const { error: countersError } = await supabase
        .from('counters')
        .delete()
        .eq('user_id', userId);

      if (countersError) {
        logger.error('[Delete Account] Error deleting counters:', countersError);
        // Continue anyway - try to delete other data
      }

      // Delete events (in case some weren't cascaded)
      const { error: eventsError } = await supabase
        .from('counter_events')
        .delete()
        .eq('user_id', userId);

      if (eventsError) {
        logger.error('[Delete Account] Error deleting events:', eventsError);
      }

      // Delete streaks
      const { error: streaksError } = await supabase
        .from('counter_streaks')
        .delete()
        .eq('user_id', userId);

      if (streaksError) {
        logger.error('[Delete Account] Error deleting streaks:', streaksError);
      }

      // Delete badges (if counter_badges table exists)
      try {
        const { error: badgesError } = await supabase
          .from('counter_badges')
          .delete()
          .eq('user_id', userId);

        if (badgesError && !badgesError.message?.includes('does not exist')) {
          logger.error('[Delete Account] Error deleting badges:', badgesError);
        }
      } catch (badgesError) {
        // Table might not exist, ignore
        logger.log('[Delete Account] Badges table not found, skipping');
      }

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) {
        logger.error('[Delete Account] Error deleting profile:', profileError);
      }

      // 2. Clear local SQLite database
      try {
        const { execute } = await import('../../lib/db');
        
        // Delete all counters for this user
        try {
          await execute('DELETE FROM lc_counters WHERE user_id = ?', [userId]);
        } catch (error) {
          logger.error('[Delete Account] Error deleting local counters:', error);
        }
        
        // Delete all events for this user
        try {
          await execute('DELETE FROM lc_events WHERE user_id = ?', [userId]);
        } catch (error) {
          logger.error('[Delete Account] Error deleting local events:', error);
        }
        
        // Delete all streaks for this user
        try {
          await execute('DELETE FROM lc_streaks WHERE user_id = ?', [userId]);
        } catch (error) {
          logger.error('[Delete Account] Error deleting local streaks:', error);
        }
        
        // Delete all badges for this user
        try {
          await execute('DELETE FROM lc_badges WHERE user_id = ?', [userId]);
        } catch (error) {
          logger.error('[Delete Account] Error deleting local badges:', error);
        }
      } catch (error) {
        logger.error('[Delete Account] Error importing db module:', error);
        // Continue with AsyncStorage cleanup
      }

      // 3. Clear all AsyncStorage data related to this user
      try {
        await clearSyncCursors();

        // Clear profile image (only if it's the current user's)
        try {
          const currentProfileImage = await AsyncStorage.getItem('profile_image_uri');
          if (currentProfileImage) {
            await AsyncStorage.removeItem('profile_image_uri');
          }
        } catch (error) {
          logger.error('[Delete Account] Error clearing profile image:', error);
        }
        
        // Clear session expired flag
        await AsyncStorage.removeItem('session_expired');
        
        // CRITICAL: Clear pro_unlocked status to prevent new accounts from inheriting premium
        await AsyncStorage.removeItem('pro_unlocked');
        
        // Clear database storage keys (for mock database)
        try {
          await AsyncStorage.multiRemove([
            '@livra_db_counters',
            '@livra_db_events',
            '@livra_db_streaks',
            '@livra_db_badges',
          ]);
        } catch (error) {
          logger.error('[Delete Account] Error clearing database storage keys:', error);
        }

        // Reset onboarding flags (modern + legacy key) + Livra reminder prefs / engagement
        await AsyncStorage.multiRemove([
          ONBOARDING_COMPLETED_STORAGE_KEY,
          'is_onboarded',
          ONBOARDING_REMOTE_PENDING_KEY,
          LIVRA_REMINDERS_ENABLED_KEY,
          'livra_bn_engagement_v1',
          'livra_bn_last_foreground_v1',
        ]);
      } catch (error) {
        logger.error('[Delete Account] Error clearing AsyncStorage:', error);
        // Continue anyway
      }

      // Clear UI state (do this last to avoid hook errors)
      try {
        // Clear counters and events stores
        useCountersStore.setState({ marks: [], loading: false, error: null, recentUpdates: new Map() });
        useEventsStore.setState({ events: [], loading: false, error: null });
      } catch (error) {
        logger.error('[Delete Account] Error clearing stores:', error);
        // Continue anyway
      }

      // 4. Delete the auth user from Supabase auth.users table
      // This requires a database function with SECURITY DEFINER privileges
      try {
        const { error: deleteAuthUserError } = await supabase.rpc('delete_auth_user', {
          user_id_to_delete: userId
        });

        if (deleteAuthUserError) {
          // If the function doesn't exist, log a warning but don't fail
          if (deleteAuthUserError.message?.includes('function') && deleteAuthUserError.message?.includes('does not exist')) {
            logger.warn('[Delete Account] delete_auth_user function not found. Auth user will remain in database. Please run the SQL function to enable full account deletion.');
          } else {
            logger.error('[Delete Account] Error deleting auth user:', deleteAuthUserError);
            // Continue anyway - data is already deleted
          }
        } else {
          logger.log('[Delete Account] Auth user deleted successfully');
        }
      } catch (error) {
        logger.error('[Delete Account] Error calling delete_auth_user function:', error);
        // Continue anyway - data is already deleted
      }

      logger.log('[Delete Account] All user data deleted successfully');
    } catch (error: any) {
      logger.error('[Delete Account] Error deleting user data:', error);
      throw new Error('Failed to delete all user data: ' + (error.message || 'Unknown error'));
    }
  };

  // Rotation animation for refresh icon
  const refreshIconRotation = refreshRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const scrollContentBottomPad =
    spacing['3xl'] + TAB_BAR_CONTENT_HEIGHT + insets.bottom + spacing.lg;

  return (
    <GradientBackground children={
      <>
        <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollContentBottomPad }]}>
        {/* Top bar — aligned with Marks screen rhythm */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBarIconBtn}
            onPress={() => router.push('/(tabs)/home')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Back to marks"
          >
            <Ionicons name="menu-outline" size={22} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <AppText variant="headline" style={[styles.topBarTitle, { color: themeColors.text }]}>
            Profile
          </AppText>
          <TouchableOpacity
            onPress={handlePickImage}
            style={[
              styles.topBarAvatar,
              { backgroundColor: themeColors.surface, borderColor: themeColors.border },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Change profile photo"
          >
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.topBarAvatarImage} />
            ) : (
              <Ionicons name="person-outline" size={20} color={themeColors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Identity + sync */}
        <View style={styles.identityBlock}>
          <TouchableOpacity
            activeOpacity={user ? 0.75 : 1}
            onPress={() => user && setIsProfileExpanded(!isProfileExpanded)}
            disabled={!user}
          >
            <AppText
              variant="subtitle"
              style={{ color: themeColors.text, fontWeight: fontWeight.bold }}
            >
              {profileName}
            </AppText>
            {user && isProfileExpanded && user.email && profileName !== user.email ? (
              <AppText variant="caption" style={[styles.identityEmail, { color: themeColors.textSecondary }]}>
                {user.email}
              </AppText>
            ) : null}
          </TouchableOpacity>
          <View style={styles.identityRow}>
            <View style={styles.identityStatus}>
              <View style={[styles.syncDot, { backgroundColor: themeColors.accent.primary }]} />
              <AppText variant="caption" style={{ color: themeColors.textSecondary }}>
                {profileHint}
              </AppText>
            </View>
            {user ? (
              <TouchableOpacity
                onPress={handleSync}
                disabled={syncState.isSyncing}
                style={[
                  styles.syncPill,
                  {
                    backgroundColor: themeColors.surfaceVariant,
                    borderColor: themeColors.border,
                  },
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Sync data"
              >
                <Animated.View
                  style={{
                    transform: [{ rotate: syncState.isSyncing ? refreshIconRotation : '0deg' }],
                  }}
                >
                  <Ionicons
                    name={syncState.isSyncing ? 'refresh' : 'refresh-outline'}
                    size={22}
                    color={themeColors.textSecondary}
                  />
                </Animated.View>
              </TouchableOpacity>
            ) : null}
          </View>
          {user &&
          (persistedSyncDiag?.coreSyncedAtIso || syncState.lastSyncedAt) ? (
            <View>
              <AppText variant="caption" style={[styles.lastSyncedText, { color: themeColors.textTertiary }]}>
                Last synced{' '}
                {new Date(
                  persistedSyncDiag?.coreSyncedAtIso ?? syncState.lastSyncedAt ?? '',
                ).toLocaleTimeString()}{' '}
                (marks & events)
              </AppText>
              {(persistedSyncDiag?.maintenanceWarnings?.length ?? syncState.maintenanceWarnings.length) > 0 ? (
                <AppText variant="caption" style={[styles.lastSyncedText, { color: themeColors.textTertiary }]}>
                  Background maintenance incomplete — try syncing again later
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>

        {!user ? (
          <PrimaryButton
            onPress={handleSignIn}
            backgroundColor={themeColors.accent.primary}
            indicatorColor={themeColors.text}
            shadowVariant="sm"
            accessibilityLabel="Sign in"
          >
            <AppText variant="button" style={{ color: themeColors.text, fontWeight: fontWeight.bold }}>
              Sign In
            </AppText>
          </PrimaryButton>
        ) : null}

        {/* Email Verification Banner - Only show when email is not verified */}
        {user && isEmailVerified === false && (() => {
          const bannerBgColor = applyOpacity(themeColors.warning, theme === 'light' ? 0.28 : 0.18);
          const bannerBorder = themeColors.warning;
          return (
            <View style={[styles.verificationBanner, { backgroundColor: bannerBgColor, borderColor: bannerBorder }]}>
              <View style={styles.verificationBannerContent}>
                <Ionicons name="mail-outline" size={20} color={themeColors.textSecondary} style={styles.verificationIcon} />
                <View style={styles.verificationTextContainer}>
                  <AppText variant="body" style={[styles.verificationTitle, { color: themeColors.text }]}>
                    Verify your email address
                  </AppText>
                  <AppText variant="caption" style={[styles.verificationMessage, { color: themeColors.textSecondary }]}>
                    Please check your inbox and click the verification link to complete your account setup.
                    {verificationRetryCount > 0 && (
                      <AppText variant="caption" style={{ color: themeColors.textSecondary, fontStyle: 'italic' }}>
                        {'\n'}Verification email sent {verificationRetryCount} time{verificationRetryCount !== 1 ? 's' : ''}.
                      </AppText>
                    )}
                    {lastResendTime && (
                      <AppText variant="caption" style={{ color: themeColors.textSecondary, fontStyle: 'italic' }}>
                        {'\n'}Last sent {Math.floor((Date.now() - lastResendTime) / 1000 / 60)} minute{Math.floor((Date.now() - lastResendTime) / 1000 / 60) !== 1 ? 's' : ''} ago.
                      </AppText>
                    )}
                  </AppText>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleResendVerificationEmail()}
                disabled={isResendingVerification}
                style={[styles.resendButton, { backgroundColor: themeColors.accent.primary }]}
                activeOpacity={0.7}
              >
                {isResendingVerification ? (
                  <AppText variant="body" style={[styles.resendButtonText, { color: themeColors.text }]}>
                    Sending...
                  </AppText>
                ) : (
                  <AppText variant="body" style={[styles.resendButtonText, { color: themeColors.text }]}>
                    Resend
                  </AppText>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Expanded Profile Section */}
        {user && isProfileExpanded && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <View style={[styles.expandedSection, { backgroundColor: themeColors.surface }]}>
              <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary, marginBottom: spacing.md }]}>
                {canUsePasswordChange ? 'Change password' : 'Sign-in method'}
              </AppText>
              {canUsePasswordChange ? (
                <>
                  <View style={styles.inputContainer}>
                    <AppText variant="body" style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Current password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Enter current password"
                      placeholderTextColor={themeColors.textTertiary}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <AppText variant="body" style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      New password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="At least 6 characters"
                      placeholderTextColor={themeColors.textTertiary}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <AppText variant="body" style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                      Confirm new password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Confirm new password"
                      placeholderTextColor={themeColors.textTertiary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.changePasswordButton,
                      { backgroundColor: themeColors.accent.primary },
                      isChangingPassword && styles.changePasswordButtonDisabled,
                    ]}
                    onPress={handleChangePassword}
                    disabled={isChangingPassword}
                  >
                    <AppText variant="button" style={[styles.changePasswordButtonText, { color: themeColors.text }]}>
                      {isChangingPassword ? 'Updating…' : 'Update password'}
                    </AppText>
                  </TouchableOpacity>
                </>
              ) : (
                <AppText variant="body" style={{ color: themeColors.textSecondary, lineHeight: 22 }}>
                  {passwordCredentialNotApplicableMessage()}
                </AppText>
              )}
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Appearance */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionKicker, { color: themeColors.textTertiary }]}>
            Appearance
          </AppText>
          <Card
            backgroundColor={themeColors.surface}
            borderColor={themeColors.border}
            borderRadiusKey="card"
          >
            <View style={styles.settingRowTall}>
              <View
                style={[
                  styles.settingIconWrap,
                  {
                    backgroundColor: applyOpacity(
                      themeColors.accent.primary,
                      theme === 'dark' ? 0.2 : 0.12,
                    ),
                  },
                ]}
              >
                <Ionicons
                  name={themeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
                  size={22}
                  color={themeColors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText
                  variant="body"
                  style={{ color: themeColors.text, fontWeight: fontWeight.semibold }}
                >
                  Dark Mode
                </AppText>
              </View>
              <Switch
                value={themeMode === 'dark'}
                onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
                trackColor={{ false: themeColors.border, true: themeColors.accent.primary }}
                thumbColor={themeColors.surface}
              />
            </View>
          </Card>
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionKicker, { color: themeColors.textTertiary }]}>
            Subscription
          </AppText>
          <Card
            backgroundColor={themeColors.surface}
            borderColor={themeColors.border}
            borderRadiusKey="card"
          >
            <View style={styles.subscriptionBlock}>
              <View style={styles.subscriptionTitleRow}>
                <View style={styles.subscriptionTitleSide} />
                <View style={styles.subscriptionTitleCenter}>
                  <AppText
                    variant="body"
                    style={{
                      color: themeColors.accent.primary,
                      fontWeight: fontWeight.bold,
                      textAlign: 'center',
                    }}
                  >
                    {isProUnlocked ? 'Livra+ Unlocked' : 'Livra+'}
                  </AppText>
                </View>
                <View style={styles.subscriptionTitleSide}>
                  {isProUnlocked ? (
                    <Ionicons name="checkmark-circle" size={24} color={themeColors.accent.primary} />
                  ) : null}
                </View>
              </View>
              <PrimaryButton
                onPress={() => router.push('/paywall')}
                backgroundColor={themeColors.accent.primary}
                indicatorColor={themeColors.text}
                shadowVariant="sm"
                accessibilityLabel={isProUnlocked ? 'Manage Livra+' : 'Unlock Livra+'}
              >
                <AppText variant="button" style={{ color: themeColors.text, fontWeight: fontWeight.bold }}>
                  {isProUnlocked ? 'Manage Livra+' : 'Unlock Livra+'}
                </AppText>
              </PrimaryButton>
            </View>
          </Card>
        </View>

        {/* Data & Privacy */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionKicker, { color: themeColors.textTertiary }]}>
            Data & Privacy
          </AppText>
          {user ? (
            <Card
              backgroundColor={themeColors.surface}
              borderColor={themeColors.border}
              borderRadiusKey="card"
              style={{ marginBottom: spacing.sm }}
            >
              <TouchableOpacity
                style={styles.settingRowTall}
                onPress={openChangePasswordUi}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.settingIconWrap,
                    {
                      backgroundColor: applyOpacity(
                        themeColors.accent.primary,
                        theme === 'dark' ? 0.16 : 0.12,
                      ),
                    },
                  ]}
                >
                  <Ionicons name="key-outline" size={22} color={themeColors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="body" style={{ color: themeColors.text, fontWeight: fontWeight.semibold }}>
                    {canUsePasswordChange ? 'Change password' : 'Password & sign-in'}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward-outline" size={18} color={themeColors.textTertiary} />
              </TouchableOpacity>
            </Card>
          ) : null}
          <TouchableOpacity
            style={[
              styles.csvButton,
              {
                backgroundColor: themeColors.surfaceVariant,
                borderColor: themeColors.border,
              },
            ]}
            onPress={handleExportCSV}
            activeOpacity={0.82}
          >
            <Ionicons name="download-outline" size={22} color={themeColors.text} />
            <AppText variant="button" style={{ color: themeColors.text, fontWeight: fontWeight.semibold }}>
              Export CSV
            </AppText>
          </TouchableOpacity>
          <BackupRestoreSection embedded />
        </View>

        {/* Account Section */}
        {user && (
          <View style={styles.section}>
            <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
              Account
            </AppText>
            
            <TouchableOpacity
              style={[styles.button, styles.signOutButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={() => {
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Sign Out',
                      style: 'destructive',
                      onPress: handleSignOut,
                    },
                  ]
                );
              }}
            >
              <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                Sign Out
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.deleteAccountButton, { backgroundColor: themeColors.surface, borderColor: themeColors.error }]}
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
              activeOpacity={isDeletingAccount ? 1 : 0.7}
            >
              <AppText variant="button" style={[styles.buttonText, { color: themeColors.error, opacity: isDeletingAccount ? 0.6 : 1 }]}>
                {isDeletingAccount ? 'Deleting Account...' : 'Delete Account'}
              </AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer — legal + version (screenshot-aligned) */}
        <View style={[styles.section, styles.footerLegal]}>
          <View style={styles.legalRow}>
            <TouchableOpacity
              onPress={() => router.push('/legal/terms-and-conditions')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <AppText variant="caption" style={{ color: themeColors.textSecondary }}>
                Terms of Service
              </AppText>
            </TouchableOpacity>
            <Text style={{ color: themeColors.textTertiary }}> · </Text>
            <TouchableOpacity
              onPress={() => router.push('/legal/privacy-policy')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <AppText variant="caption" style={{ color: themeColors.textSecondary }}>
                Privacy Policy
              </AppText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleVersionTap}
            activeOpacity={1}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
          >
            <Text style={[styles.versionCaps, { color: themeColors.textTertiary }]}>
              LIVRA V{Constants.expoConfig?.version || '1.0.42'}
              {Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode
                ? ` (BUILD ${Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode})`
                : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </SafeAreaView>

      {/* Email Input Modal for CSV Export (Web) */}
      <Modal
        visible={showEmailInput}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEmailInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
            <AppText variant="headline" style={[styles.modalTitle, { color: themeColors.text }]}>
              Enter Email Address
            </AppText>
            <AppText variant="body" style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
              Please enter the email address where you want to send the CSV export:
            </AppText>
            <TextInput
              style={[styles.modalInput, { 
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
                color: themeColors.text,
              }]}
              placeholder="email@example.com"
              placeholderTextColor={themeColors.textTertiary}
              value={csvExportEmail}
              onChangeText={setCsvExportEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: themeColors.surfaceVariant }]}
                onPress={() => {
                  setShowEmailInput(false);
                  setCsvExportEmail('');
                }}
              >
                <AppText variant="button" style={[styles.modalButtonText, { color: themeColors.text }]}>
                  Cancel
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, { backgroundColor: themeColors.accent.primary }]}
                onPress={async () => {
                  if (!csvExportEmail || !csvExportEmail.trim()) {
                    showError('Please enter a valid email address.');
                    return;
                  }
                  
                  // Validate email format
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(csvExportEmail.trim())) {
                    showError('Please enter a valid email address.');
                    return;
                  }

                  setShowEmailInput(false);
                  await performCSVExport(csvExportEmail.trim());
                  setCsvExportEmail('');
                }}
              >
                <AppText variant="button" style={[styles.modalButtonText, { color: themeColors.text }]}>
                  Export
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={changePasswordModalVisible}
        animationType="slide"
        onRequestClose={() => {
          if (!isChangingPassword) setChangePasswordModalVisible(false);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.changePasswordModalKeyboard}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <View style={styles.changePasswordModalBody}>
              <View style={styles.changePasswordModalHeader}>
                <View style={[styles.changePasswordModalHeaderSide, styles.changePasswordModalHeaderSideStart]}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!isChangingPassword) setChangePasswordModalVisible(false);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <AppText style={{ color: themeColors.textSecondary }}>Cancel</AppText>
                  </TouchableOpacity>
                </View>
                <View style={styles.changePasswordModalHeaderTitleWrap}>
                  <AppText variant="headline" style={[styles.changePasswordModalTitle, { color: themeColors.text }]}>
                    Change password
                  </AppText>
                </View>
                <View style={styles.changePasswordModalHeaderSide} />
              </View>
              <ScrollView
                contentContainerStyle={styles.changePasswordModalScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.changePasswordModalForm}>
                  <View style={styles.inputContainer}>
                    <AppText
                      variant="body"
                      style={[styles.inputLabel, styles.changePasswordModalLabel, { color: themeColors.textSecondary }]}
                    >
                      Current password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        styles.changePasswordModalInput,
                        {
                          backgroundColor: themeColors.surface,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Enter current password"
                      placeholderTextColor={themeColors.textTertiary}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <AppText
                      variant="body"
                      style={[styles.inputLabel, styles.changePasswordModalLabel, { color: themeColors.textSecondary }]}
                    >
                      New Password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        styles.changePasswordModalInput,
                        {
                          backgroundColor: themeColors.surface,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Enter new password (min 6 characters)"
                      placeholderTextColor={themeColors.textTertiary}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <AppText
                      variant="body"
                      style={[styles.inputLabel, styles.changePasswordModalLabel, { color: themeColors.textSecondary }]}
                    >
                      Confirm New Password
                    </AppText>
                    <TextInput
                      style={[
                        styles.input,
                        styles.changePasswordModalInput,
                        {
                          backgroundColor: themeColors.surface,
                          color: themeColors.text,
                          borderColor: themeColors.border,
                        },
                      ]}
                      placeholder="Confirm new password"
                      placeholderTextColor={themeColors.textTertiary}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isChangingPassword}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.changePasswordButton,
                      styles.changePasswordModalButton,
                      { backgroundColor: themeColors.accent.primary },
                      isChangingPassword && styles.changePasswordButtonDisabled,
                    ]}
                    onPress={handleChangePassword}
                    disabled={isChangingPassword}
                  >
                    <AppText variant="button" style={[styles.changePasswordButtonText, { color: themeColors.text }]}>
                      {isChangingPassword ? 'Changing Password...' : 'Change Password'}
                    </AppText>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      </>
    } />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    marginBottom: spacing.md,
  },
  topBarIconBtn: {
    width: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  topBarAvatar: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topBarAvatarImage: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
  },
  identityBlock: {
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  identityEmail: {
    marginTop: spacing.xxs,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  identityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    paddingRight: spacing.sm,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.sm,
  },
  syncPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionKicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  settingRowTall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  settingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionBlock: {
    padding: spacing.md,
    gap: spacing.md,
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  subscriptionTitleCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionTitleSide: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  footerLegal: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  versionCaps: {
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.md,
    position: 'relative',
  },
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  verificationBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  verificationIcon: {
    marginRight: spacing.xs,
  },
  verificationTextContainer: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  verificationTitle: {
    fontWeight: '600',
  },
  verificationMessage: {
    lineHeight: 18,
  },
  resendButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendButtonText: {
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
  },
  avatarText: {
    textTransform: 'uppercase',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -5,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 1,
  },
  removeImageButton: {
    marginTop: spacing.xs,
  },
  profileMeta: {
    flex: 1,
    gap: spacing.xs,
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  profileInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  fullEmail: {
    fontSize: 12,
    marginTop: spacing.xs / 2,
  },
  expandIndicator: {
    marginTop: spacing.xs,
  },
  refreshButtonContainer: {
    position: 'absolute',
    right: spacing.lg,
    top: '50%',
    transform: [{ translateY: -28 }], // Center the icon, accounting for potential text below
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 48,
    height: 56, // Fixed height to accommodate icon + text, prevents movement
  },
  refreshButton: {
    padding: spacing.md, 
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
  },
  syncStatusText: {
    position: 'absolute',
    top: 48, // Position below the button icon
    fontSize: 10,
    textAlign: 'center',
    width: 48,
    left: 0,
  },
  lastSyncedText: {
    fontSize: 11,
    marginTop: spacing.xs / 2,
  },
  expandedSection: {
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  inputContainer: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 14,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  changePasswordButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  changePasswordButtonDisabled: {
    opacity: 0.6,
  },
  changePasswordButtonText: {
    textAlign: 'center',
  },
  changePasswordModalKeyboard: {
    flex: 1,
  },
  changePasswordModalBody: {
    flex: 1,
    paddingTop: spacing['3xl'],
  },
  changePasswordModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  changePasswordModalHeaderSide: {
    width: 88,
    justifyContent: 'center',
  },
  changePasswordModalHeaderSideStart: {
    alignItems: 'flex-start',
  },
  changePasswordModalHeaderTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  changePasswordModalTitle: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  changePasswordModalScrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
    alignItems: 'center',
  },
  changePasswordModalForm: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  changePasswordModalLabel: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  changePasswordModalInput: {
    width: '100%',
    alignSelf: 'center',
  },
  changePasswordModalButton: {
    alignSelf: 'stretch',
    width: '100%',
  },
  signOutButton: {
    borderWidth: 1,
    marginTop: spacing.lg,
  },
  deleteAccountButton: {
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  section: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonText: {
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  settingLabel: {
    flex: 1,
  },
  proCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proText: {},
  restoreMessageContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  restoreMessageText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    marginBottom: spacing.xs,
  },
  modalMessage: {
    marginBottom: spacing.sm,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    borderWidth: 1,
  },
  modalButtonConfirm: {},
  modalButtonText: {
    fontWeight: '600',
  },
});

