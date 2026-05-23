import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  LAST_PUSHED_AT_KEY,
  LAST_PULLED_AT_KEY,
  LEGACY_LAST_SYNCED_AT_KEY,
} from '../lib/sync/syncCursors';
import * as Haptics from 'expo-haptics';
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

const ONBOARDING_MARKS = [
  { name: 'Workout', emoji: '💪', color: '#3B82F6', unit: 'sessions' as const },
  { name: 'Steps', emoji: '👟', color: '#F97316', unit: 'items' as const },
  { name: 'Sleep', emoji: '🌙', color: '#10B981', unit: 'days' as const },
];

const QUESTION_WORDS = 'What do you keep meaning to do?'.split(' ');

const FRAME_LINES = [
  'Most people quit by day 4.',
  'You probably will too.',
  'But if you come back on day 5...',
  '...something starts to change.',
];

type ActivationMark = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  unit?: string | null;
};

type Phase = 'loading' | 'intro' | 'frame' | 'activate';

function AnimatedWord({ word, delay }: { word: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
  }, [delay, progress]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [8, 0]) }],
  }));

  return <Animated.Text style={[wordStyles.word, animStyle]}>{word} </Animated.Text>;
}

const wordStyles = StyleSheet.create({
  word: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    lineHeight: fontSize['2xl'] * 1.45,
  },
});

function MarkCard({
  mark,
  selected,
  index,
  onPress,
}: {
  mark: (typeof ONBOARDING_MARKS)[0];
  selected: boolean;
  index: number;
  onPress: () => void;
}) {
  const slideY = useSharedValue(60);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    const entryDelay = 900 + index * 140;
    slideY.value = withDelay(entryDelay, withSpring(0, { damping: 18, stiffness: 160 }));
    opacity.value = withDelay(entryDelay, withTiming(1, { duration: 220 }));
  }, [index, slideY, opacity]);

  useEffect(() => {
    scale.value = withSpring(selected ? 1.03 : 1, { damping: 14, stiffness: 220 });
  }, [selected, scale]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: slideY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={containerStyle}>
      <TouchableOpacity
        style={[
          markCardStyles.card,
          selected
            ? { borderColor: mark.color, borderWidth: 2 }
            : { borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1 },
        ]}
        onPress={onPress}
        activeOpacity={0.72}
      >
        <Text style={markCardStyles.emoji}>{mark.emoji}</Text>
        <Text style={markCardStyles.name}>{mark.name}</Text>
        {selected && <View style={[markCardStyles.dot, { backgroundColor: mark.color }]} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const markCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  emoji: { fontSize: 28 },
  name: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: '#FFFFFF',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

function BouncingArrow({ color }: { color: string }) {
  const ty = useSharedValue(0);

  useEffect(() => {
    ty.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [ty]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Ionicons name="chevron-down" size={26} color={color} />
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  const { completeOnboarding } = useUIStore();
  const { createCounter, incrementCounter } = useCounters();
  const { requestPermissions, updateSmartNotifications } = useNotifications();
  const { user } = useAuth();
  const { showError, showWarning } = useNotification();

  const [phase, setPhase] = useState<Phase>('loading');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [activationMark, setActivationMark] = useState<ActivationMark | null>(null);
  const [creatingMarks, setCreatingMarks] = useState(false);
  const [tapped, setTapped] = useState(false);

  // Frame phase: sequential line reveals
  const [visibleLines, setVisibleLines] = useState(0);
  const [showFrameButton, setShowFrameButton] = useState(false);

  // Activate phase animations
  const cardOpacity = useSharedValue(0.6);
  const overlayOpacity = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const cardScale = useSharedValue(1);
  const [activateHeader, setActivateHeader] = useState('Your first mark is waiting.');

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!user?.id) {
        if (!cancelled) setPhase('intro');
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
          setPhase('intro');
        }
      } catch (err) {
        logger.error('[Onboarding] Entry phase error:', err);
        if (!cancelled) setPhase('intro');
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (phase !== 'frame') return;
    setVisibleLines(0);
    setShowFrameButton(false);
    const timers = [0, 800, 1600, 2400, 3200].map((delay, i) =>
      setTimeout(() => {
        if (i < 4) setVisibleLines(i + 1);
        else setShowFrameButton(true);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const handleMarkToggle = (index: number) => {
    setSelectedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index],
    );
  };

  const handleStartAnyway = async () => {
    if (!user?.id || creatingMarks) return;
    setCreatingMarks(true);
    try {
      const onboardingStartTime = new Date().toISOString();
      await AsyncStorage.multiSet([
        [LAST_PUSHED_AT_KEY, onboardingStartTime],
        [LAST_PULLED_AT_KEY, onboardingStartTime],
        [LEGACY_LAST_SYNCED_AT_KEY, onboardingStartTime],
      ]);

      const created: ActivationMark[] = [];
      for (const index of [...selectedIndices].sort((a, b) => a - b)) {
        const sample = ONBOARDING_MARKS[index];
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
        } catch (err) {
          if (err instanceof DuplicateCounterError || err instanceof DuplicateMarkError) {
            // skip duplicates silently
          } else {
            logger.error(`[Onboarding] Failed to create "${sample.name}":`, err);
          }
        }
      }

      if (created.length === 0) {
        showError('Could not create marks. Please try again.');
        return;
      }

      setActivationMark(created[0]);
      setPhase('activate');
    } catch (err) {
      logger.error('[Onboarding] handleStartAnyway error:', err);
      showError('Something went wrong. Please try again.');
    } finally {
      setCreatingMarks(false);
    }
  };

  const finishOnboarding = useCallback(async () => {
    try { await requestPermissions(); } catch (e) { logger.warn('[Onboarding] requestPermissions:', e); }
    try { await updateSmartNotifications(user?.id); } catch (e) { logger.warn('[Onboarding] updateSmartNotifications:', e); }
    try {
      const remoteOk = await completeOnboarding(user?.id);
      if (user?.id && !remoteOk) {
        showWarning('Set up on this device. Sync to account failed — open again online.');
      }
      router.replace('/(tabs)/home');
    } catch (err) {
      logger.error('[Onboarding] finishOnboarding error:', err);
      showError('Could not finish setup. Please try again.');
    }
  }, [completeOnboarding, requestPermissions, updateSmartNotifications, router, user?.id, showWarning, showError]);

  const handleFirstTap = async () => {
    if (tapped || !activationMark || !user?.id) return;
    setTapped(true);

    cardScale.value = withSpring(0.97, { damping: 20, stiffness: 320 });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    iconScale.value = withSequence(
      withSpring(1.18, { damping: 12, stiffness: 280 }),
      withSpring(1.0, { damping: 16, stiffness: 200 }),
    );
    cardOpacity.value = withSpring(1.0, { damping: 18, stiffness: 120 });
    overlayOpacity.value = withSpring(0, { damping: 18, stiffness: 140 });
    cardScale.value = withSpring(1.0, { damping: 18, stiffness: 200 });
    setActivateHeader('One down.');

    try {
      await incrementCounter(activationMark.id, user.id, 1);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      logger.error('[Onboarding] First tap increment failed:', err);
    }

    setTimeout(() => finishOnboarding(), 900);
  };

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const overlayAnimStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const iconAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  // Loading
  if (phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: '#000000' }]}>
        <ActivityIndicator size="large" color={themeColors.accent.primary} />
      </View>
    );
  }

  // Screen 1 — The question
  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: '#000000' }]}>
        <View style={styles.introContent}>
          <View style={styles.questionRow}>
            {QUESTION_WORDS.map((word, i) => (
              <AnimatedWord key={i} word={word} delay={i * 110} />
            ))}
          </View>

          <View style={styles.markList}>
            {ONBOARDING_MARKS.map((mark, i) => (
              <MarkCard
                key={mark.name}
                mark={mark}
                selected={selectedIndices.includes(i)}
                index={i}
                onPress={() => handleMarkToggle(i)}
              />
            ))}
          </View>

          {selectedIndices.length >= 1 && (
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={() => setPhase('frame')}
              activeOpacity={0.82}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Screen 2 — The honest frame
  if (phase === 'frame') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: '#000000' }]}>
        <View style={styles.frameContent}>
          {FRAME_LINES.map((line, i) => (
            <Text
              key={i}
              style={[
                styles.frameLine,
                { opacity: visibleLines > i ? 1 : 0 },
              ]}
            >
              {line}
            </Text>
          ))}

          {showFrameButton && (
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartAnyway}
              disabled={creatingMarks}
              activeOpacity={0.82}
            >
              {creatingMarks
                ? <ActivityIndicator color="#000000" />
                : <Text style={styles.startBtnText}>Start anyway.</Text>}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Screen 3 — First mark tap
  const markColor = activationMark?.color ?? themeColors.accent.primary;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <View style={styles.activateContent}>
        <Text style={[styles.activateHeader, { color: themeColors.text }]}>
          {activateHeader}
        </Text>

        {activationMark && (
          <View style={styles.cardWrap}>
            <Animated.View
              style={[
                styles.activateCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
                cardAnimStyle,
              ]}
            >
              <Animated.Text style={[styles.activateEmoji, iconAnimStyle]}>
                {activationMark.emoji ?? '📊'}
              </Animated.Text>

              <Text style={[styles.activateName, { color: themeColors.text }]}>
                {activationMark.name}
              </Text>

              {tapped ? (
                <Ionicons name="checkmark-circle" size={52} color={markColor} />
              ) : (
                <View style={styles.arrowAndBtn}>
                  <BouncingArrow color={markColor} />
                  <TouchableOpacity
                    style={[styles.plusBtn, { backgroundColor: markColor }]}
                    onPress={handleFirstTap}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.plusBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>

            {!tapped && (
              <Animated.View
                pointerEvents="none"
                style={[StyleSheet.absoluteFillObject, styles.blurOverlay, overlayAnimStyle]}
              />
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Screen 1
  introContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  questionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing['3xl'],
  },
  markList: { width: '100%', marginBottom: spacing.xl },
  continueBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },

  // Screen 2
  frameContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    gap: spacing['3xl'],
  },
  frameLine: {
    fontSize: fontSize.xl,
    color: '#FFFFFF',
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.xl * 1.55,
  },
  startBtn: {
    marginTop: spacing.xl,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    minWidth: 160,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  startBtnText: {
    color: '#000000',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },

  // Screen 3
  activateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  activateHeader: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  cardWrap: { width: '100%', position: 'relative' },
  activateCard: {
    width: '100%',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.lg,
  },
  activateEmoji: { fontSize: 56 },
  activateName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  arrowAndBtn: { alignItems: 'center', gap: spacing.sm },
  plusBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBtnText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: fontWeight.bold,
    lineHeight: 32,
  },
  blurOverlay: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: borderRadius.card,
  },
});
