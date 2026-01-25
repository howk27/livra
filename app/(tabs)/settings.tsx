import React, { useState, useEffect, useRef } from 'react';
import {
  View,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { supabase } from '../../lib/supabase';
import { useIAP } from '../../hooks/useIAP';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../hooks/useAuth';
import { generateAllCountersCSV } from '../../lib/csv';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { GradientBackground } from '../../components/GradientBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText } from '../../components/Typography';
import { useNotification } from '../../contexts/NotificationContext';
import { useCountersStore } from '../../state/countersSlice';
import { logger } from '../../lib/utils/logger';
import { toUserMessage } from '../../lib/utils/errorMessages';
import { uploadAvatar, getAvatarUrl, deleteAvatar, refreshAvatarUrl } from '../../lib/storage/avatarStorage';
import { diagEvent } from '../../lib/debug/iapDiagnostics';
import { unlockDashboard } from '../../lib/debug/dashboardUnlock';
import Constants from 'expo-constants';
import { checkProStatus } from '../../lib/iap/iap';

export default function SettingsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  const { themeMode, setThemeMode } = useUIStore();
  const { isProUnlocked, restorePurchases, purchasing } = useIAP();
  const { sync, syncState } = useSync();
  const { counters } = useCounters();
  const { events } = useEventsStore();
  const { user, signOut: authSignOut } = useAuth();
  const { showSuccess, showError } = useNotification();
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
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreMessageType, setRestoreMessageType] = useState<'success' | 'error' | null>(null);

  // Hidden gesture for diagnostics (tap version 7 times within 1.5 seconds)
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = () => {
    versionTapCount.current += 1;

    // Clear existing timer
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    // If 7 taps reached, open IAP Dashboard (production-safe hidden gesture)
    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
        versionTapTimer.current = null;
      }
      // Log diagnostic event for tracking
      diagEvent('diagnostics_opened_hidden_gesture', { 
        threshold: 7, 
        screen: 'iap-dashboard' 
      });
      // Unlock dashboard before navigation (production route guard)
      unlockDashboard();
      router.push('/iap-dashboard' as Href);
      return;
    }

    // Reset counter after 1.5 seconds of inactivity
    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  };
  
  const profileName = user?.email ?? 'Guest user';
  const profileInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'LC';
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
  }, [user]);

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

  // Listen for auth state changes to update verification status
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'USER_UPDATED' && session?.user) {
        const isVerified = !!(session.user.email_confirmed_at || session.user.confirmed_at);
        setIsEmailVerified(isVerified);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
              await AsyncStorage.removeItem('last_synced_at');
              
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
    // Check if user has premium
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

  const handleRestore = async () => {
    setRestoreMessage(null);
    setRestoreMessageType(null);

    try {
      await restorePurchases();
      const isUnlocked = await checkProStatus();
      if (isUnlocked) {
        setRestoreMessage('Restored successfully.');
        setRestoreMessageType('success');
      } else {
        setRestoreMessage('No active subscription found for this Apple ID.');
        setRestoreMessageType('error');
      }
      setTimeout(() => {
        setRestoreMessage(null);
        setRestoreMessageType(null);
      }, 5000);
    } catch (err: any) {
      logger.error('[Settings] Error in handleRestore:', err);
      const errorMsg = err?.message || String(err);
      const errorCode = err?.code || '';
      let userMessage = 'Restore failed. Please try again.';
      const isCancelled =
        errorCode === 'USER_CANCELLED' ||
        errorCode === 'E_USER_CANCELLED' ||
        err?.cancelled === true ||
        errorMsg.toLowerCase().includes('cancel') ||
        errorMsg.toLowerCase().includes('request canceled');
      if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userMessage = 'Restore failed: Network error. Please check your connection.';
      } else if (isCancelled) {
        userMessage = 'Restore was cancelled.';
      }
      setRestoreMessage(userMessage);
      setRestoreMessageType('error');
      setTimeout(() => {
        setRestoreMessage(null);
        setRestoreMessageType(null);
      }, 5000);
    }
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

  const handleProfileCardPress = () => {
    if (user) {
      setIsProfileExpanded(!isProfileExpanded);
    }
  };

  const handleChangePassword = async () => {
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
      // Verify current password by attempting to sign in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });

      if (verifyError) {
        showError('Current password is incorrect');
        setIsChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        showError(toUserMessage(updateError, 'Failed to update password'));
      } else {
        showSuccess('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsProfileExpanded(false);
      }
    } catch (error: any) {
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
        // Clear sync timestamp
        await AsyncStorage.removeItem('last_synced_at');
        
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

        // Reset onboarding state
        await AsyncStorage.removeItem('is_onboarded');
      } catch (error) {
        logger.error('[Delete Account] Error clearing AsyncStorage:', error);
        // Continue anyway
      }

      // Clear UI state (do this last to avoid hook errors)
      try {
        // Clear counters and events stores
        useCountersStore.setState({ marks: [], loading: false, error: null });
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


  return (
    <GradientBackground children={
      <>
        <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <AppText variant="headline" style={[styles.screenTitle, { color: themeColors.text }]}>
          Profile
        </AppText>
        <TouchableOpacity
          onPress={handleProfileCardPress}
          disabled={!user}
          activeOpacity={user ? 0.7 : 1}
          style={[styles.profileCard, { backgroundColor: themeColors.surface }]}
        >
          <TouchableOpacity
            onPress={() => {
              handlePickImage();
            }}
            style={[styles.avatarContainer, { backgroundColor: themeColors.accent.primary + '33' }]}
          >
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
            ) : (
              <AppText variant="headline" style={[styles.avatarText, { color: themeColors.primary }]}>
                {profileInitials}
              </AppText>
            )}
            <View style={[styles.avatarEditBadge, { backgroundColor: themeColors.primary, borderColor: themeColors.surface }]}>
              <Ionicons name="camera" size={20} color={themeColors.text} />
            </View>
          </TouchableOpacity>
          <View style={styles.profileMeta}>
            <View style={styles.profileMetaRow}>
              <View style={styles.profileInfo}>
                <AppText variant="subtitle" style={{ color: themeColors.text }}>
                  {profileName}
                </AppText>
                {user && isProfileExpanded && (
                  <AppText variant="body" style={[styles.fullEmail, { color: themeColors.textSecondary }]}>
                    {user.email}
                  </AppText>
                )}
              </View>
            </View>
            {!isProfileExpanded && (
              <View>
                <AppText variant="body" style={{ color: themeColors.textSecondary }}>
                  {profileHint}
                </AppText>
                {user && syncState.lastSyncedAt && (
                  <AppText variant="caption" style={[styles.lastSyncedText, { color: themeColors.textTertiary }]}>
                    Last synced: {new Date(syncState.lastSyncedAt).toLocaleTimeString()}
                  </AppText>
                )}
              </View>
            )}
            {user && (
              <View style={styles.expandIndicator}>
                <Ionicons
                  name={isProfileExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={themeColors.textSecondary}
                />
              </View>
            )}
          </View>
          {user && (
            <View style={styles.refreshButtonContainer}>
              <TouchableOpacity
                onPress={() => {
                  handleSync();
                }}
                disabled={syncState.isSyncing}
                style={styles.refreshButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Animated.View
                  style={{
                    transform: [{ rotate: syncState.isSyncing ? refreshIconRotation : '0deg' }],
                  }}
                >
                  <Ionicons
                    name={syncState.isSyncing ? 'refresh' : 'refresh-outline'}
                    size={28}
                    color={themeColors.textSecondary}
                  />
                </Animated.View>
              </TouchableOpacity>
              {syncState.isSyncing && (
                <AppText variant="caption" style={[styles.syncStatusText, { color: themeColors.textSecondary }]}>
                  Syncing...
                </AppText>
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* Email Verification Banner - Only show when email is not verified */}
        {user && isEmailVerified === false && (() => {
          // Use darker yellow/orange for both themes for better visibility
          const bannerColor = theme === 'light' ? '#D97706' : '#F59E0B'; // Darker amber/orange for light, brighter amber for dark
          const bannerBgColor = theme === 'light' ? '#FEF3C7' : 'rgba(217, 119, 6, 0.15)'; // Soft light amber for light, transparent dark orange for dark
          const iconColor = theme === 'light' ? '#B45309' : '#F59E0B'; // Darker icon color for light, amber for dark
          const buttonTextColor = theme === 'light' ? '#FFFFFF' : '#FFFFFF'; // White text on both themes for contrast
          
          return (
            <View style={[styles.verificationBanner, { backgroundColor: bannerBgColor, borderColor: bannerColor }]}>
              <View style={styles.verificationBannerContent}>
                <Ionicons name="mail-outline" size={20} color={iconColor} style={styles.verificationIcon} />
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
                style={[styles.resendButton, { backgroundColor: bannerColor }]}
                activeOpacity={0.7}
              >
                {isResendingVerification ? (
                  <AppText variant="body" style={[styles.resendButtonText, { color: buttonTextColor }]}>
                    Sending...
                  </AppText>
                ) : (
                  <AppText variant="body" style={[styles.resendButtonText, { color: buttonTextColor }]}>
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
                Change Password
              </AppText>
              
              <View style={styles.inputContainer}>
                <AppText variant="body" style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                  Current Password
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
                  New Password
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
                <AppText variant="body" style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
                  Confirm New Password
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
                  { backgroundColor: themeColors.primary },
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
          </KeyboardAvoidingView>
        )}

        {/* Account Section */}
        <View style={styles.section}>
          {!user && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: themeColors.primary }]}
              onPress={handleSignIn}
            >
              <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                Sign In
              </AppText>
            </TouchableOpacity>
          )}
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            Appearance
          </AppText>
          
          <View style={[styles.settingRow, { backgroundColor: themeColors.surface }]}>
            <AppText variant="body" style={[styles.settingLabel, { color: themeColors.text }]}>
              Dark Mode
            </AppText>
            <Switch
              value={themeMode === 'dark'}
              onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
            />
          </View>
        </View>

        {/* Pro Section */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            Livra+
          </AppText>
          
          {isProUnlocked ? (
            <View style={[styles.proCard, { backgroundColor: themeColors.accent.primary + '2E' }]}>
              <AppText variant="subtitle" style={[styles.proText, { color: themeColors.accent.primary }]}>
                ✓ Livra+ Unlocked
              </AppText>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.primary }]}
                onPress={() => router.push('/paywall')}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Livra+
                </AppText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={handleRestore}
                disabled={purchasing}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text, opacity: purchasing ? 0.5 : 1 }]}>
                  Restore Purchases
                </AppText>
              </TouchableOpacity>
              {restoreMessage && (
                <View
                  style={[
                    styles.restoreMessageContainer,
                    {
                      backgroundColor:
                        restoreMessageType === 'success'
                          ? (themeColors.success || '#4CAF50') + '20'
                          : (themeColors.error || '#F44336') + '20',
                      borderColor:
                        restoreMessageType === 'success'
                          ? (themeColors.success || '#4CAF50')
                          : (themeColors.error || '#F44336'),
                    },
                  ]}
                >
                  <AppText
                    variant="body"
                    style={[
                      styles.restoreMessageText,
                      {
                        color:
                          restoreMessageType === 'success'
                            ? (themeColors.success || '#4CAF50')
                            : (themeColors.error || '#F44336'),
                      },
                    ]}
                  >
                    {restoreMessage}
                  </AppText>
                </View>
              )}
            </>
          )}
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            Data
          </AppText>
          
          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.surface }]}
            onPress={handleExportCSV}
          >
            <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
              Export CSV
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <AppText variant="caption" style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
            Legal
          </AppText>
          
          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.surface }]}
            onPress={() => router.push('/legal/privacy-policy')}
          >
            <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
              Privacy Policy
            </AppText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.surface }]}
            onPress={() => router.push('/legal/terms-and-conditions')}
          >
            <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
              Terms & Conditions
            </AppText>
          </TouchableOpacity>
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

        {/* About - Moved to bottom */}
        <View style={[styles.section, styles.aboutSection]}>
          <TouchableOpacity onPress={handleVersionTap} activeOpacity={1}>
            <AppText variant="caption" style={[styles.aboutText, { color: themeColors.textTertiary }]}>
              Livra v{Constants.expoConfig?.version || '1.0.36'}
            </AppText>
          </TouchableOpacity>
          <AppText variant="caption" style={[styles.aboutText, { color: themeColors.textTertiary }]}>
            Track progress, not pressure
          </AppText>
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
                style={[styles.modalButton, styles.modalButtonConfirm, { backgroundColor: themeColors.primary }]}
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
      </>
    } />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  screenTitle: {
    marginBottom: spacing.lg,
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
    fontSize: 13,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    borderRadius: 12,
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
  aboutSection: {
    marginTop: spacing['3xl'],
    paddingTop: spacing.xxl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  aboutText: {
    textAlign: 'center',
    marginBottom: spacing.xs,
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

