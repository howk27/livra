import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { useAuth } from '../../hooks/useAuth';
import { useMarksStore, DuplicateMarkError } from '../../state/countersSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { useNotification } from '../../contexts/NotificationContext';
import { getRecommendedMarks } from '../../lib/onboarding/markRecommendations';
import type { HealthKitType } from '../../lib/health/healthTypes';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';
import { logger } from '../../lib/utils/logger';
import { applyOpacity } from '@/src/components/icons/color';

const DOTS = [0, 1, 2, 3, 4];
const CURRENT = 4;
const MIN_GOAL_LENGTH = 3;

export default function RecommendationsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const { completeOnboarding } = useUIStore();
  const { goalTitle, focusArea, identitySelections, reset: resetOnboarding } = useOnboardingStore();
  const addMark = useMarksStore(s => s.addMark);
  const addGoal = useGoalsStore(s => s.addGoal);
  const { isProUnlocked } = useIapSubscriptions();
  const { showError } = useNotification();

  const recommendedMarks = getRecommendedMarks(identitySelections, focusArea);
  const [selectedMarkNames, setSelectedMarkNames] = useState<Set<string>>(
    () => new Set(recommendedMarks.map(m => m.name)),
  );
  const [goalInput, setGoalInput] = useState(goalTitle);
  const [loading, setLoading] = useState(false);

  const toggleMark = useCallback((markName: string) => {
    setSelectedMarkNames(prev => {
      const next = new Set(prev);
      if (next.has(markName)) next.delete(markName);
      else next.add(markName);
      return next;
    });
  }, []);

  const handleStartLivra = async () => {
    if (loading || !user?.id) return;
    setLoading(true);
    const userId = user.id;
    try {
      const marksToCreate = recommendedMarks.filter(m => selectedMarkNames.has(m.name));
      let sortIndex = useMarksStore.getState().marks.filter(m => !m.deleted_at).length;
      for (const template of marksToCreate) {
        try {
          await addMark({
            user_id: userId,
            name: template.name,
            emoji: template.emoji,
            color: template.color,
            unit: 'sessions',
            enable_streak: false,
            sort_index: sortIndex,
            total: 0,
            health_kit_type: (template.healthKitType as HealthKitType | null) ?? null,
          });
          sortIndex += 1;
        } catch (markErr) {
          if (markErr instanceof DuplicateMarkError) {
            logger.log(`[Onboarding] Skipping duplicate mark "${template.name}"`);
          } else {
            throw markErr;
          }
        }
      }
      const trimmedGoal = goalInput.trim();
      if (trimmedGoal.length >= MIN_GOAL_LENGTH) {
        try {
          await addGoal({ title: trimmedGoal, userId, isPro: isProUnlocked });
        } catch (goalErr) {
          if (!(goalErr instanceof GoalLimitError)) throw goalErr;
        }
      }
      const now = new Date().toISOString();
      await completeOnboarding(userId, { focusArea: focusArea ?? undefined, completedAt: now });
      resetOnboarding();
      router.replace('/(tabs)/home' as any);
    } catch (err) {
      logger.error('[Onboarding] handleStartLivra failed:', err);
      showError("Couldn't finish setup. Please try again.");
      setLoading(false);
    }
  };

  const hasRecommendations = recommendedMarks.length > 0;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {DOTS.map(i => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === CURRENT ? '#FEB729' : 'transparent',
                borderColor: i === CURRENT ? '#FEB729' : themeColors.border,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Headline */}
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            Here's where you start.
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            A few daily marks and your first goal. Adjust anything — nothing's locked in.
          </Text>
        </View>

        {/* Recommended marks */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>
            YOUR DAILY MARKS
          </Text>

          {hasRecommendations ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.marksScroll}
            >
              {recommendedMarks.map(mark => {
                const isSelected = selectedMarkNames.has(mark.name);
                const cardBg = isSelected
                  ? applyOpacity(mark.color || '#FEB729', 0.15)
                  : themeColors.surface;
                const borderColor = isSelected ? (mark.color || '#FEB729') : themeColors.border;

                return (
                  <TouchableOpacity
                    key={mark.name}
                    style={[
                      styles.markCard,
                      {
                        backgroundColor: cardBg,
                        borderColor,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => toggleMark(mark.name)}
                    activeOpacity={0.78}
                    accessibilityRole="checkbox"
                    accessibilityLabel={mark.name}
                    accessibilityState={{ checked: isSelected }}
                  >
                    {/* Icon on tinted bg */}
                    <View
                      style={[
                        styles.markIconBg,
                        { backgroundColor: applyOpacity(mark.color || '#FEB729', 0.20) },
                      ]}
                    >
                      <Text style={styles.markEmoji}>{mark.emoji}</Text>
                    </View>
                    <Text
                      style={[
                        styles.markName,
                        { color: isSelected ? (mark.color || '#FEB729') : themeColors.text },
                      ]}
                    >
                      {mark.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={[styles.fallbackText, { color: themeColors.textSecondary }]}>
              You can add marks anytime from home.
            </Text>
          )}
        </View>

        {/* Goal input */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>
            YOUR FIRST GOAL
          </Text>
          <TextInput
            style={[
              styles.goalInput,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
                color: themeColors.text,
              },
            ]}
            value={goalInput}
            onChangeText={setGoalInput}
            placeholder="What are you working toward?"
            placeholderTextColor={themeColors.textTertiary}
            multiline
            maxLength={120}
            editable={!loading}
            accessibilityLabel="Your first goal"
          />
        </View>

        {/* Start CTA */}
        <View style={styles.ctaArea}>
          <Text style={[styles.ctaHeadline, { color: themeColors.text }]}>
            Ready when you are.
          </Text>
          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handleStartLivra}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start Livra"
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#111111" />
            ) : (
              <Text style={styles.ctaText}>Start Livra</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },
  copyArea: { gap: spacing.md },
  prompt: {
    fontSize: 28,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  subtext: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 24,
  },
  section: { gap: spacing.md },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  marksScroll: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  markCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.card,
    gap: spacing.sm,
  },
  markIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markEmoji: {
    fontSize: 20,
  },
  markName: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    lineHeight: 16,
  },
  fallbackText: {
    fontSize: 15,
    fontFamily: 'Inter',
    lineHeight: 22,
  },
  goalInput: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: borderRadius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 17,
    fontFamily: 'Satoshi',
    textAlignVertical: 'top',
    lineHeight: 24,
  },
  ctaArea: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  ctaHeadline: {
    fontSize: 22,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  cta: {
    backgroundColor: '#FEB729',
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: {
    color: '#111111',
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
});
