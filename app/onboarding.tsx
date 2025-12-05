import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../state/uiSlice';
import { useCounters } from '../hooks/useCounters';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../hooks/useAuth';
import { DuplicateCounterError, DuplicateMarkError } from '../state/countersSlice';
import { query } from '../lib/db';
import { useNotification } from '../contexts/NotificationContext';
import { logger } from '../lib/utils/logger';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';

const APP_BRAND_LOGO_LIGHT = require('../assets/branding/Logo NoBG.png');
const APP_BRAND_LOGO_DARK = require('../assets/branding/Logo NoBG dark.png');

const SAMPLE_COUNTERS = [
  { name: 'Gym Sessions', emoji: '🏋️', color: '#3B82F6', unit: 'sessions' as const },
  { name: 'Books Read', emoji: '📖', color: '#10B981', unit: 'items' as const },
  { name: 'Meditation Days', emoji: '🧘', color: '#A855F7', unit: 'days' as const },
  { name: 'Water Bottles', emoji: '💧', color: '#06B6D4', unit: 'items' as const },
  { name: 'Study Hours', emoji: '📚', color: '#F97316', unit: 'sessions' as const },
];

export default function OnboardingScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  const { completeOnboarding } = useUIStore();
  const { createCounter } = useCounters();
  const { requestPermissions } = useNotifications();
  const { user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();

  const [step, setStep] = useState(0);
  const [selectedCounters, setSelectedCounters] = useState<number[]>([]);
  const [skipSetup, setSkipSetup] = useState<boolean | null>(null); // null = not answered, true = skip, false = continue
  const [checkingExistingCounters, setCheckingExistingCounters] = useState(true);

  // Check if user already has counters in the database - if so, skip onboarding
  useEffect(() => {
    const checkExistingCounters = async () => {
      // Only check for authenticated users with valid UUID
      if (!user?.id) {
        setCheckingExistingCounters(false);
        return;
      }

      try {
        // Query database directly for existing counters (non-deleted)
        const existingCounters = await query<{ id: string }>(
          'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
          [user.id]
        );

        if (existingCounters && existingCounters.length > 0) {
          // User already has counters - skip onboarding
          logger.log('[Onboarding] User already has counters in database - skipping onboarding');
          try {
            await requestPermissions(); // Still request permissions
            await completeOnboarding(user.id);
            router.replace('/(tabs)/home');
          } catch (error) {
            logger.error('[Onboarding] Error completing onboarding after finding existing counters:', error);
            // Even if this fails, we can still navigate (onboarding state might already be set)
            router.replace('/(tabs)/home');
          }
          return;
        }
      } catch (error) {
        logger.error('[Onboarding] Error checking for existing counters:', error);
        // Continue with onboarding if check fails
      } finally {
        setCheckingExistingCounters(false);
      }
    };

    checkExistingCounters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only re-run when user ID changes

  const handleCounterToggle = (index: number) => {
    if (selectedCounters.includes(index)) {
      setSelectedCounters(selectedCounters.filter((i) => i !== index));
    } else {
      if (selectedCounters.length < 2) {
        setSelectedCounters([...selectedCounters, index]);
      }
    }
  };

  const handleSkipSetup = async (skip: boolean) => {
    setSkipSetup(skip);
    
    if (skip) {
      // User wants to skip setup - complete onboarding immediately and go to dashboard
      try {
        await requestPermissions(); // Still request permissions even if skipping
        await completeOnboarding(user?.id);
        router.replace('/(tabs)/home');
      } catch (error) {
        logger.error('Error completing onboarding:', error);
        showError('Error completing onboarding. Please try again.');
      }
    } else {
      // User wants to continue with setup - go to counter selection
      setStep(1);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      // This shouldn't happen if user answered yes/no
      return;
    } else if (step === 1) {
      setStep(2);
    } else {
      try {
        // Set sync timestamp BEFORE creating counters
        // This ensures that when sync happens, it won't pull old counters from Supabase
        // Only counters created/updated after this timestamp will be pulled
        const onboardingStartTime = new Date().toISOString();
        await AsyncStorage.setItem('last_synced_at', onboardingStartTime);

        // Create selected counters
        // IMPORTANT: Create all counters with skipSync=true to prevent multiple syncs during onboarding
        // This prevents each counter creation from triggering a sync that might pull back old/deleted counters
        const duplicateCounterNames: string[] = [];
        const createdCounters: string[] = [];
        const errors: string[] = [];
        
        for (const index of selectedCounters) {
          const sample = SAMPLE_COUNTERS[index];
          try {
            await createCounter({
              name: sample.name,
              emoji: sample.emoji,
              color: sample.color,
              unit: sample.unit,
              enable_streak: true,
              user_id: user?.id!,
              skipSync: true, // Skip sync during onboarding to prevent pulling old counters
            });
            createdCounters.push(sample.name);
          } catch (counterError) {
            // Handle duplicate counter/mark error gracefully - skip it and continue
            if (counterError instanceof DuplicateCounterError || counterError instanceof DuplicateMarkError) {
              const counterName = counterError instanceof DuplicateCounterError 
                ? counterError.counterName 
                : (counterError as any).markName || sample.name;
              logger.warn(`[Onboarding] Duplicate counter detected: "${counterName}" - skipping`);
              duplicateCounterNames.push(counterName);
              // Continue with other counters instead of stopping
            } else {
              // Log unexpected errors but continue with other counters
              logger.error(`[Onboarding] Error creating counter "${sample.name}":`, counterError);
              errors.push(sample.name);
            }
          }
        }

        // Show user-friendly summary after all counters are processed
        if (duplicateCounterNames.length > 0 || errors.length > 0) {
          if (duplicateCounterNames.length > 0) {
            const duplicateMessage = `${duplicateCounterNames.length > 1 ? 'Some counters' : 'A counter'} you selected already exists (${duplicateCounterNames.join(', ')}). ${duplicateCounterNames.length > 1 ? 'They were' : 'It was'} skipped.`;
            showWarning(duplicateMessage);
          }
          if (errors.length > 0) {
            const errorMessage = `There was an error creating ${errors.length} counter(s): ${errors.join(', ')}.`;
            showError(errorMessage);
          }
          if (createdCounters.length > 0) {
            const successMessage = `Successfully created ${createdCounters.length} counter(s): ${createdCounters.join(', ')}.`;
            showSuccess(successMessage);
          }
        } else if (createdCounters.length > 0) {
          // Show success message if all counters were created successfully
          const successMessage = `Successfully created ${createdCounters.length} counter(s): ${createdCounters.join(', ')}.`;
          showSuccess(successMessage);
        }

        // Request notification permissions
        await requestPermissions();

        // Complete onboarding (save to both local storage and database)
        await completeOnboarding(user?.id);
        
        // Navigate to home - sync will happen automatically via useCounters hook
        // The sync will push the new counters but won't pull old ones because of the timestamp we set
        router.replace('/(tabs)/home');
      } catch (error) {
        // Handle unexpected errors during onboarding completion
        logger.error('Error completing onboarding:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        
        showError(`There was an issue completing your setup: ${errorMessage}. You can continue using the app and complete setup later.`);
        // Try to complete onboarding even if there was an error
        try {
          await completeOnboarding(user?.id);
        } catch (fallbackError) {
          // If even that fails, just log it (user can fix later)
          logger.error('Error in fallback onboarding completion:', fallbackError);
        }
        // Navigate to home after a short delay to allow notification to be seen
        setTimeout(() => {
          router.replace('/(tabs)/home');
        }, 2000);
      }
    }
  };

  const canContinue = (step === 0 && skipSetup !== null) || step === 1 || (step === 2 && selectedCounters.length > 0);

  // Show loading indicator while checking for existing counters
  if (checkingExistingCounters) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {step === 0 && (
          <View style={styles.stepContent}>
            <View style={styles.appIconContainer}>
              <Image
                source={theme === 'dark' ? APP_BRAND_LOGO_DARK : APP_BRAND_LOGO_LIGHT}
                style={styles.appIcon}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>Welcome to Livra</Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
              Track your progress without guilt or pressure. Simple marks for the things that
              matter to you.
            </Text>
            
            <View style={styles.yesNoContainer}>
              <Text style={[styles.yesNoQuestion, { color: themeColors.text }]}>
                Would you like to set up your first marks now?
              </Text>
              <View style={styles.yesNoButtons}>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    {
                      backgroundColor: skipSetup === true ? themeColors.primary : themeColors.surface,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => handleSkipSetup(true)}
                >
                  <Text
                    style={[
                      styles.yesNoButtonText,
                      { color: skipSetup === true ? '#FFFFFF' : themeColors.text },
                    ]}
                  >
                    Yes, skip for now
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.yesNoButton,
                    {
                      backgroundColor: skipSetup === false ? themeColors.primary : themeColors.surface,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => handleSkipSetup(false)}
                >
                  <Text
                    style={[
                      styles.yesNoButtonText,
                      { color: skipSetup === false ? '#FFFFFF' : themeColors.text },
                    ]}
                  >
                    No, let's set up
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: themeColors.text }]}>
              Choose Your First Marks
            </Text>
            <Text style={[styles.stepDescription, { color: themeColors.textSecondary }]}>
              Select up to 2 sample marks to get started (you can create more later)
            </Text>

            <View style={styles.counterOptions}>
              {SAMPLE_COUNTERS.map((counter, index) => {
                const iconType = resolveCounterIconType(counter);
                const isSelected = selectedCounters.includes(index);

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.counterOption,
                      {
                        backgroundColor: isSelected
                          ? applyOpacity(themeColors.primary, 0.12)
                          : themeColors.surface,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                      },
                    ]}
                    onPress={() => handleCounterToggle(index)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.iconContainer}>
                      {iconType ? (
                        <CounterIcon
                          type={iconType}
                          size={32}
                          variant="withBackground"
                          fallbackEmoji={counter.emoji}
                          ariaLabel={`${counter.name} mark icon`}
                          color={counter.color}
                        />
                      ) : (
                        <Text style={styles.counterEmoji}>{counter.emoji}</Text>
                      )}
                    </View>
                    <Text style={[styles.counterName, { color: themeColors.text }]}>
                      {counter.name}
                    </Text>
                    {isSelected && (
                      <View style={styles.checkmark}>
                        <Text style={styles.checkmarkText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.emoji}>🔔</Text>
            <Text style={[styles.stepTitle, { color: themeColors.text }]}>
              Stay on Track with Reminders
            </Text>
            <Text style={[styles.stepDescription, { color: themeColors.textSecondary }]}>
              Get gentle reminders to update your marks. You can customize these later in
              settings.
            </Text>
          </View>
        )}

        {/* Navigation Buttons */}
        {step > 0 && (
          <View style={styles.navigation}>
            {step > 1 && (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.surface }]}
                onPress={() => setStep(step - 1)}
              >
                <Text style={[styles.buttonText, { color: themeColors.text }]}>Back</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.button,
                styles.primaryButton,
                { backgroundColor: themeColors.primary },
                !canContinue && styles.disabledButton,
              ]}
              onPress={handleNext}
              disabled={!canContinue}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                {step === 2 ? 'Get Started' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step Indicators */}
        <View style={styles.indicators}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.indicator,
                {
                  backgroundColor:
                    i === step ? themeColors.primary : themeColors.border,
                },
              ]}
            />
          ))}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

const FeatureItem: React.FC<{ icon: string; text: string; themeColors: any }> = ({
  icon,
  text,
  themeColors,
}) => (
  <View style={styles.featureItem}>
    <Text style={[styles.featureIcon, { color: themeColors.primary }]}>{icon}</Text>
    <Text style={[styles.featureText, { color: themeColors.text }]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconContainer: {
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  appIcon: {
    width: 180,
    height: 180,
  },
  emoji: {
    fontSize: 80,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSize.lg,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.xl,
  },
  features: {
    width: '100%',
    marginTop: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  featureIcon: {
    fontSize: fontSize['2xl'],
    marginRight: spacing.md,
    fontWeight: fontWeight.bold,
  },
  featureText: {
    fontSize: fontSize.lg,
  },
  stepTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  stepDescription: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  counterOptions: {
    width: '100%',
  },
  counterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  iconContainer: {
    marginRight: 15,
  },
  counterEmoji: {
    fontSize: fontSize['2xl'],
  },
  counterName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  navigation: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryButton: {
    flex: 2,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  yesNoContainer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  yesNoQuestion: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  yesNoButtons: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.md,
  },
  yesNoButton: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yesNoButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});

