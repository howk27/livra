import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LAST_PUSHED_AT_KEY,
  LAST_PULLED_AT_KEY,
  LEGACY_LAST_SYNCED_AT_KEY,
} from '../lib/sync/syncCursors';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../theme/tokens';
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
import { BigIncrementButton } from '../components/BigIncrementButton';

const SAMPLE_COUNTERS = [
  { name: 'Gym Sessions', emoji: '🏋️', color: '#3B82F6', unit: 'sessions' as const },
  { name: 'Books Read', emoji: '📖', color: '#10B981', unit: 'items' as const },
  { name: 'Meditation Days', emoji: '🧘', color: '#A855F7', unit: 'days' as const },
  { name: 'Water Bottles', emoji: '💧', color: '#06B6D4', unit: 'items' as const },
  { name: 'Study Hours', emoji: '📚', color: '#F97316', unit: 'sessions' as const },
];

type ActivationMark = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  unit?: string | null;
};

type Phase = 'loading' | 'select' | 'activate';

export default function OnboardingScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  const { completeOnboarding } = useUIStore();
  const { createCounter, incrementCounter } = useCounters();
  const { requestPermissions, updateSmartNotifications } = useNotifications();
  const { user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();

  const [phase, setPhase] = useState<Phase>('loading');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [activationMark, setActivationMark] = useState<ActivationMark | null>(null);
  const [creatingMarks, setCreatingMarks] = useState(false);
  const [incrementing, setIncrementing] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const scaleAnims = useRef(SAMPLE_COUNTERS.map(() => new Animated.Value(1))).current;

  const pulseSelect = useCallback((index: number, selected: boolean) => {
    Animated.spring(scaleAnims[index], {
      toValue: selected ? 1.03 : 1,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [scaleAnims]);

  useEffect(() => {
    let cancelled = false;

    const resolveEntryPhase = async () => {
      if (!user?.id) {
        if (!cancelled) setPhase('select');
        return;
      }

      try {
        const rows = await query<ActivationMark>(
          `SELECT id, name, emoji, color, unit FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_index ASC, created_at ASC LIMIT 1`,
          [user.id],
        );

        if (cancelled) return;

        if (rows?.length) {
          setActivationMark(rows[0]);
          setPhase('activate');
        } else {
          setPhase('select');
        }
      } catch (error) {
        logger.error('[Onboarding] Error resolving entry phase:', error);
        if (!cancelled) setPhase('select');
      }
    };

    resolveEntryPhase();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleCounterToggle = (index: number) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
      pulseSelect(index, false);
      return;
    }
    if (selectedIndices.length >= 2) {
      const [first, second] = selectedIndices;
      setSelectedIndices([second, index]);
      pulseSelect(first, false);
      pulseSelect(index, true);
      return;
    }
    setSelectedIndices([...selectedIndices, index]);
    pulseSelect(index, true);
  };

  const handleContinueFromSelect = async () => {
    if (selectedIndices.length < 1 || !user?.id) return;

    setCreatingMarks(true);
    try {
      const onboardingStartTime = new Date().toISOString();
      await AsyncStorage.multiSet([
        [LAST_PUSHED_AT_KEY, onboardingStartTime],
        [LAST_PULLED_AT_KEY, onboardingStartTime],
        [LEGACY_LAST_SYNCED_AT_KEY, onboardingStartTime],
      ]);

      const ordered = [...selectedIndices].sort((a, b) => a - b);
      const created: ActivationMark[] = [];
      const duplicateNames: string[] = [];
      const failedNames: string[] = [];

      for (const index of ordered) {
        const sample = SAMPLE_COUNTERS[index];
        try {
          const mark = await createCounter({
            name: sample.name,
            emoji: sample.emoji,
            color: sample.color,
            unit: sample.unit,
            enable_streak: true,
            user_id: user.id,
            skipSync: true,
          });
          created.push({
            id: mark.id,
            name: mark.name,
            emoji: mark.emoji ?? sample.emoji,
            color: mark.color ?? sample.color,
            unit: mark.unit,
          });
        } catch (counterError) {
          if (counterError instanceof DuplicateCounterError || counterError instanceof DuplicateMarkError) {
            const counterName =
              counterError instanceof DuplicateCounterError
                ? counterError.counterName
                : counterError.markName;
            duplicateNames.push(counterName);
          } else {
            logger.error(`[Onboarding] Error creating mark "${sample.name}":`, counterError);
            failedNames.push(sample.name);
          }
        }
      }

      if (duplicateNames.length > 0) {
        showWarning(
          `${duplicateNames.length > 1 ? 'Some marks' : 'A mark'} already exist (${duplicateNames.join(', ')}). Skipped.`,
        );
      }
      if (failedNames.length > 0) {
        showError(`Could not create: ${failedNames.join(', ')}.`);
      }

      if (created.length === 0) {
        showError('Add at least one new mark to continue.');
        return;
      }

      setActivationMark(created[0]);
      setPhase('activate');
      if (created.length > 1) {
        showSuccess(`${created.length} marks added. Log your first one below.`);
      }
    } catch (error) {
      logger.error('[Onboarding] Error creating marks:', error);
      showError('Something went wrong. Please try again.');
    } finally {
      setCreatingMarks(false);
    }
  };

  const finishOnboarding = useCallback(async () => {
    try {
      await requestPermissions();
    } catch (e) {
      logger.warn('[Onboarding] Notification permission:', e);
    }
    try {
      await updateSmartNotifications(user?.id);
    } catch (e) {
      logger.warn('[Onboarding] Notification reschedule:', e);
    }
    try {
      const remoteOk = await completeOnboarding(user?.id);
      if (user?.id && !remoteOk) {
        showWarning(
          'You are set up on this device. Syncing completion to your account failed — stay online and open the app again so other devices pick it up.',
        );
      }
      router.replace('/(tabs)/home');
    } catch (error) {
      logger.error('[Onboarding] Error finishing onboarding:', error);
      showError('Could not finish setup. Please try again.');
    }
  }, [completeOnboarding, requestPermissions, updateSmartNotifications, router, user?.id, showWarning, showError]);

  const handleFirstCompletion = async () => {
    if (!activationMark || !user?.id || incrementing || celebrated) return;

    setIncrementing(true);
    try {
      await incrementCounter(activationMark.id, user.id, 1);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCelebrated(true);
      setTimeout(() => {
        finishOnboarding();
      }, 900);
    } catch (error) {
      logger.error('[Onboarding] First completion increment failed:', error);
      showError('Could not log completion. Try again.');
      setIncrementing(false);
    }
  };

  const canContinueSelect = selectedIndices.length >= 1 && selectedIndices.length <= 2;
  const ctaLabel = 'Continue';

  if (phase === 'loading') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const markColor = activationMark?.color || themeColors.accent.primary;
  const activationIconType =
    activationMark &&
    resolveCounterIconType({
      name: activationMark.name,
      emoji: activationMark.emoji || '📊',
      color: activationMark.color || markColor,
      unit: (activationMark.unit as 'sessions') || 'sessions',
    });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {phase === 'select' && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: themeColors.text }]}>Choose your first marks</Text>
            <Text style={[styles.stepDescription, { color: themeColors.textSecondary }]}>
              Pick 1–2 to start. You can add more anytime from the home screen.
            </Text>

            <View style={styles.counterOptions}>
              {SAMPLE_COUNTERS.map((counter, index) => {
                const iconType = resolveCounterIconType(counter);
                const isSelected = selectedIndices.includes(index);

                return (
                  <Animated.View
                    key={counter.name}
                    style={{ transform: [{ scale: scaleAnims[index] }] }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.counterOption,
                        {
                          backgroundColor: isSelected
                            ? applyOpacity(themeColors.accent.primary, theme === 'dark' ? 0.22 : 0.14)
                            : themeColors.surface,
                          borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
                          borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                        },
                        isSelected && shadow.md,
                      ]}
                      onPress={() => handleCounterToggle(index)}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.iconContainer,
                          isSelected && {
                            backgroundColor: applyOpacity(counter.color, 0.2),
                            borderRadius: borderRadius.md,
                            padding: spacing.xs,
                          },
                        ]}
                      >
                        {iconType ? (
                          <CounterIcon
                            type={iconType}
                            size={isSelected ? 36 : 32}
                            variant="withBackground"
                            fallbackEmoji={counter.emoji}
                            ariaLabel={`${counter.name} mark icon`}
                            color={counter.color}
                          />
                        ) : (
                          <Text style={[styles.counterEmoji, isSelected && { fontSize: fontSize['3xl'] }]}>
                            {counter.emoji}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.counterName, { color: themeColors.text }]}>{counter.name}</Text>
                      {isSelected ? (
                        <View style={[styles.checkmark, { backgroundColor: themeColors.accent.primary }]}>
                          <Ionicons name="checkmark" size={18} color={themeColors.text} />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryCta,
                { backgroundColor: themeColors.accent.primary },
                (!canContinueSelect || creatingMarks) && styles.primaryCtaDisabled,
                shadow.md,
              ]}
              onPress={handleContinueFromSelect}
              disabled={!canContinueSelect || creatingMarks}
              activeOpacity={0.88}
            >
              {creatingMarks ? (
                <ActivityIndicator color={themeColors.text} />
              ) : (
                <Text style={[styles.primaryCtaText, { color: themeColors.text }]}>{ctaLabel}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.indicators}>
              <View style={[styles.indicator, { backgroundColor: themeColors.accent.primary }]} />
              <View style={[styles.indicator, { backgroundColor: themeColors.border }]} />
            </View>
          </View>
        )}

        {phase === 'activate' && activationMark && (
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: themeColors.text }]}>Log your first completion</Text>
            <Text style={[styles.stepDescription, { color: themeColors.textSecondary }]}>
              Tap +1 on <Text style={{ fontWeight: fontWeight.semibold }}>{activationMark.name}</Text> to see how
              Livra works.
            </Text>

            <View
              style={[
                styles.activateCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
                celebrated && { borderColor: themeColors.success, borderWidth: 2 },
              ]}
            >
              <View style={[styles.activateIconWrap, { backgroundColor: applyOpacity(markColor, 0.15) }]}>
                {activationIconType ? (
                  <CounterIcon
                    type={activationIconType}
                    size={44}
                    variant="withBackground"
                    fallbackEmoji={activationMark.emoji || '📊'}
                    ariaLabel={`${activationMark.name} icon`}
                    color={activationMark.color || markColor}
                  />
                ) : (
                  <Text style={styles.activateEmoji}>{activationMark.emoji || '📊'}</Text>
                )}
              </View>
              <Text style={[styles.activateName, { color: themeColors.text }]}>{activationMark.name}</Text>

              {celebrated ? (
                <View style={styles.celebrateBlock}>
                  <Ionicons name="checkmark-circle" size={56} color={themeColors.success} />
                  <Text style={[styles.celebrateTitle, { color: themeColors.text }]}>Nice work!</Text>
                  <Text style={[styles.celebrateSub, { color: themeColors.textSecondary }]}>
                    Taking you to your marks…
                  </Text>
                </View>
              ) : (
                <BigIncrementButton
                  onPress={handleFirstCompletion}
                  disabled={incrementing}
                  label="+1"
                />
              )}
            </View>

            <View style={styles.indicators}>
              <View style={[styles.indicator, { backgroundColor: themeColors.border }]} />
              <View style={[styles.indicator, { backgroundColor: themeColors.accent.primary }]} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
    minHeight: 420,
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
    paddingHorizontal: spacing.sm,
  },
  counterOptions: {
    width: '100%',
  },
  counterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  iconContainer: {
    marginRight: spacing.md,
  },
  counterEmoji: {
    fontSize: fontSize['2xl'],
  },
  counterName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCta: {
    width: '100%',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryCtaDisabled: {
    opacity: 0.45,
  },
  primaryCtaText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing['3xl'],
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activateCard: {
    width: '100%',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
  },
  activateIconWrap: {
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateEmoji: {
    fontSize: 44,
  },
  activateName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  celebrateBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  celebrateTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  celebrateSub: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
