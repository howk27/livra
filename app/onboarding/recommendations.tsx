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
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { logger } from '../../lib/utils/logger';

const CTA_TEXT_ACTIVE_COLOR = '#FFFFFF';
const MIN_GOAL_LENGTH = 3;

export default function RecommendationsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const { completeOnboarding } = useUIStore();
  const { goalTitle, focusArea, identitySelections, reset: resetOnboarding } = useOnboardingStore();
  const addMark = useMarksStore((s) => s.addMark);
  const addGoal = useGoalsStore((s) => s.addGoal);
  const { isProUnlocked } = useIapSubscriptions();
  const { showError } = useNotification();

  // Pure, deterministic — derived from transient store. Safe to compute on render.
  const recommendedMarks = getRecommendedMarks(identitySelections, focusArea);

  const [selectedMarkNames, setSelectedMarkNames] = useState<Set<string>>(
    () => new Set(recommendedMarks.map((m) => m.name)),
  );
  const [goalInput, setGoalInput] = useState(goalTitle);
  const [loading, setLoading] = useState(false);

  const toggleMark = useCallback((markName: string) => {
    setSelectedMarkNames((prev) => {
      const next = new Set(prev);
      if (next.has(markName)) {
        next.delete(markName);
      } else {
        next.add(markName);
      }
      return next;
    });
  }, []);

  const handleStartLivra = async () => {
    if (loading || !user?.id) return;
    setLoading(true);

    const userId = user.id;

    try {
      // Step 1: Create selected marks. addMark already guards against duplicates
      // (case-insensitive, non-deleted) at both the store and DB level, so on a
      // DuplicateMarkError we skip silently. sort_index is seeded from current
      // non-deleted mark count and incremented per successfully created mark.
      const marksToCreate = recommendedMarks.filter((m) => selectedMarkNames.has(m.name));
      let sortIndex = useMarksStore.getState().marks.filter((m) => !m.deleted_at).length;

      for (const template of marksToCreate) {
        try {
          await addMark({
            user_id: userId,
            name: template.name,
            emoji: template.icon,
            color: template.default_color,
            unit: 'sessions',
            enable_streak: false,
            sort_index: sortIndex,
            total: 0,
            health_kit_type: (template.health_kit_type as HealthKitType | null) ?? null,
          });
          sortIndex += 1;
        } catch (markErr) {
          if (markErr instanceof DuplicateMarkError) {
            // Duplicate — skip silently, do not advance sort_index.
            logger.log(`[Onboarding] Skipping duplicate mark "${template.name}"`);
          } else {
            throw markErr;
          }
        }
      }

      // Step 2: Create goal only if the trimmed title is long enough.
      const trimmedGoal = goalInput.trim();
      if (trimmedGoal.length >= MIN_GOAL_LENGTH) {
        try {
          await addGoal({
            title: trimmedGoal,
            userId,
            isPro: isProUnlocked,
          });
        } catch (goalErr) {
          if (goalErr instanceof GoalLimitError) {
            // Re-onboarding: goal cap already hit, skip goal creation silently
            logger.log('[Onboarding] Goal cap already hit — skipping goal creation');
          } else {
            throw goalErr;
          }
        }
      }

      // Step 3: Complete onboarding with meta (local-first; ignores remote-ok result here).
      const now = new Date().toISOString();
      await completeOnboarding(userId, {
        focusArea: focusArea ?? undefined,
        completedAt: now,
      });

      // Step 4: Clear transient onboarding slice before leaving the flow.
      resetOnboarding();

      // Step 5: Replace so the back gesture cannot return to onboarding.
      router.replace('/(tabs)/home' as any);
    } catch (err) {
      logger.error('[Onboarding] handleStartLivra failed:', err);
      showError("Couldn't finish setup. Please try again.");
      setLoading(false);
    }
    // On success we navigate away and unmount; no need to reset loading.
  };

  const hasRecommendations = recommendedMarks.length > 0;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            {'Here’s where you start.'}
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            {'A few daily marks and your first goal. Adjust anything — nothing’s locked in.'}
          </Text>
        </View>

        {/* Recommended marks */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
            {'YOUR DAILY MARKS'}
          </Text>
          {hasRecommendations ? (
            <View style={styles.cardList}>
              {recommendedMarks.map((mark) => {
                const isSelected = selectedMarkNames.has(mark.name);
                return (
                  <TouchableOpacity
                    key={mark.name}
                    style={[
                      styles.markCard,
                      {
                        backgroundColor: isSelected ? themeColors.primary : themeColors.surface,
                        borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                    onPress={() => toggleMark(mark.name)}
                    activeOpacity={0.78}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${mark.name} — ${mark.identity_label}`}
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text style={styles.markIcon}>{mark.icon}</Text>
                    <View style={styles.markTextWrap}>
                      <Text
                        style={[
                          styles.markName,
                          { color: isSelected ? themeColors.accent.primary : themeColors.text },
                        ]}
                      >
                        {mark.name}
                      </Text>
                      <Text style={[styles.markIdentity, { color: themeColors.textSecondary }]}>
                        {mark.identity_label}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.markCheck,
                        {
                          color: isSelected ? themeColors.accent.primary : themeColors.textTertiary,
                        },
                      ]}
                    >
                      {isSelected ? '✓' : '+'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.fallbackText, { color: themeColors.textSecondary }]}>
              {'You can add marks anytime from home.'}
            </Text>
          )}
        </View>

        {/* Goal input */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
            {'YOUR FIRST GOAL'}
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

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
          onPress={handleStartLivra}
          disabled={loading}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Start Livra"
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          {loading ? (
            <ActivityIndicator color={CTA_TEXT_ACTIVE_COLOR} />
          ) : (
            <Text style={[styles.ctaButtonText, { color: CTA_TEXT_ACTIVE_COLOR }]}>
              {'Start Livra'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },
  copyArea: {
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  subtext: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.lg * 1.5,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
  },
  cardList: {
    gap: spacing.md,
  },
  markCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    gap: spacing.md,
  },
  markIcon: {
    fontSize: fontSize.xl,
  },
  markTextWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  markName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  markIdentity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
  },
  markCheck: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  fallbackText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.base * 1.5,
  },
  goalInput: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    textAlignVertical: 'top',
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.sm,
  },
  ctaButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
