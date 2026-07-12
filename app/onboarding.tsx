import React, { useMemo, useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { SvgLogo } from '../components/ui/SvgLogo';
import { LivraWordmark } from '../components/ui/LivraWordmark';
import { PillButton } from '../components/ui/PillButton';
import { themedColors, fonts, spacing, radius, fontSize } from '../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../state/uiSlice';
import { useOnboardingStore, CommitmentLevel } from '../state/onboardingSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';
import { useAuth } from '../hooks/useAuth';
import { MARK_LIBRARY } from '../lib/suggestedCounters';
import { getMarksForCommitment, CommitmentMarkSelection } from '../lib/onboarding/commitmentEngine';
import { frequencyLabel } from '../components/ui/MarkFrequencyPicker';
import { logger } from '../lib/utils/logger';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import {
  generateGoalPackage, MIN_GOAL_LENGTH, resolveMarkForAIIcon,
  writeGoalPackageCache,
  type AIGoalMark,
} from '../lib/ai/goalGeneration';

// ─── Step dots ───────────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  const c = themedColors(useEffectiveTheme());
  return (
    <View style={dotStyles.dotsRow}>
      {Array.from({ length: total }, (_, i) => {
        const active = i === step;
        return (
          <View
            key={i}
            style={[
              dotStyles.dot,
              active
                ? [dotStyles.dotActive, { backgroundColor: c.forest }]
                : [dotStyles.dotInactive, { backgroundColor: c.borderMid }],
            ]}
          />
        );
      })}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
  },
  dot: { height: 6, borderRadius: radius.full },
  dotActive: { width: 20 },
  dotInactive: { width: 6 },
});

// ─── Pace option ─────────────────────────────────────────────────────────────

type PaceOption = {
  value: CommitmentLevel;
  label: string;
};

const PACE_OPTIONS: PaceOption[] = [
  { value: 'easing', label: "I'm easing back in." },
  { value: 'steady', label: "I'm ready for a steady rhythm." },
  { value: 'push', label: 'I want to push myself.' },
];

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user } = useAuth();

  const store = useOnboardingStore();
  const completeOnboarding = useUIStore(s => s.completeOnboarding);
  const createGoal = useGoalsStore(s => s.createGoal);
  const linkMarkToGoal = useGoalsStore(s => s.linkMarkToGoal);
  const addMark = useMarksStore(s => s.addMark);

  const [step, setStep] = useState(0);

  // In-flight state for the final "complete onboarding" persist action.
  const [loading, setLoading] = useState(false);

  // Computed marks for the marks screen (derived on entry to Step 3)
  const [marksForScreen, setMarksForScreen] = useState<CommitmentMarkSelection[]>([]);
  // Locally selected state within the marks screen (mirrors slice on advance)
  const [marksSelected, setMarksSelected] = useState<Set<string>>(new Set());

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReviewActive, setAiReviewActive] = useState(false);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewWeeks, setReviewWeeks] = useState(12);
  const [reviewMarks, setReviewMarks] = useState<AIGoalMark[]>([]);
  const [reviewMarkSelected, setReviewMarkSelected] = useState<Set<number>>(new Set());
  const [reviewDescription, setReviewDescription] = useState('');
  const reviewDescriptionRef = React.useRef('');

  const handleReviewDescriptionChange = useCallback((text: string) => {
    reviewDescriptionRef.current = text;
    setReviewDescription(text);
  }, []);

  const advance = useCallback(() => setStep((s) => s + 1), []);

  // ── AI hatch: generate → review ─────────────────────────────────────────

  const handleAIGenerate = useCallback(async () => {
    const goalText = store.goalTitle.trim();
    setAiLoading(true);
    setAiError(null);

    const result = await generateGoalPackage(goalText);
    setAiLoading(false);

    if (result.ok) {
      const pkg = result.package;
      store.setAiPackageDraft(pkg);
      setReviewTitle(pkg.goalTitle);
      setReviewWeeks(pkg.timeframeWeeks);
      setReviewMarks(pkg.marks);
      setReviewMarkSelected(new Set(pkg.marks.map((_, i) => i)));
      setReviewDescription('');
      reviewDescriptionRef.current = '';
      setAiReviewActive(true);
    } else {
      const msgs: Record<string, string> = {
        low_confidence: "Couldn’t make sense of that. Try describing your goal in one sentence.",
        free_use_exhausted: "You’ve used your free AI plan. Livra+ unlocks unlimited AI goal plans. Or continue manually below.",
        invalid_output: "Something went wrong. Continue manually below.",
        network_error: "Couldn’t reach Livra AI. Check your connection or continue manually.",
        goal_too_short: '',
      };
      setAiError(msgs[result.reason] ?? 'Something went wrong.');
    }
  }, [store]);

  const handleAIReviewConfirm = useCallback(() => {
    const selectedAIMarks = reviewMarks.filter((_, i) => reviewMarkSelected.has(i));
    if (selectedAIMarks.length === 0) return;

    const finalTitle = reviewTitle.trim() || store.goalTitle;
    store.setGoalTitle(finalTitle);

    const aiMarkSelections: CommitmentMarkSelection[] = selectedAIMarks.flatMap((m) => {
      const resolved = resolveMarkForAIIcon(m.icon);
      const libraryMark = MARK_LIBRARY.find((l) => l.id === resolved.markId);
      if (!libraryMark) return [];
      return [{ mark: { ...libraryMark, name: m.name }, weeklyTarget: m.frequency }];
    });
    if (aiMarkSelections.length === 0) return;

    setMarksForScreen(aiMarkSelections);
    setMarksSelected(new Set(aiMarkSelections.map((r) => r.mark.id)));
    setAiReviewActive(false);
    setStep(3); // Skip pace step
  }, [reviewMarks, reviewMarkSelected, reviewTitle, store]);

  const handleAIReviewDismiss = useCallback(() => {
    setAiReviewActive(false);
    store.setAiPackageDraft(null);
    // Goal text is preserved in slice; no usage spent
  }, [store]);

  // ── Step 1 → 2: commit goalTitle to slice ───────────────────────────────

  const handleGoalTitleNext = useCallback(() => {
    const trimmed = store.goalTitle.trim();
    if (!trimmed) return;
    advance();
  }, [store.goalTitle, advance]);

  // ── Step 2 → 3: commit commitment, compute marks ────────────────────────

  const handlePaceNext = useCallback(() => {
    const level = store.commitment ?? 'steady';
    const computed = getMarksForCommitment(store.goalTitle.trim() || '', level);
    setMarksForScreen(computed);
    const defaultSelected = new Set(computed.map((r) => r.mark.id));
    setMarksSelected(defaultSelected);
    advance();
  }, [store.commitment, store.goalTitle, advance]);

  // ── Step 3 (final): persist marks + complete onboarding ──────────────────
  // Onboarding runs only after account creation, so the user is already
  // authenticated here. Persist the goal/marks to that account and finish.

  const handleMarksNext = async () => {
    const ids = Array.from(marksSelected);
    store.setSelectedMarkIds(ids);
    const targets: Record<string, number> = {};
    for (const { mark, weeklyTarget } of marksForScreen) {
      if (marksSelected.has(mark.id)) targets[mark.id] = weeklyTarget;
    }
    store.setSelectedMarkTargets(targets);

    if (!user?.id) {
      Alert.alert('Something went wrong', 'Please sign in again to finish setup.');
      router.replace('/auth/signin');
      return;
    }

    setLoading(true);
    try {
      await handlePersistAndComplete(user.id);
    } catch (err) {
      logger.error('[Onboarding] complete failed:', err);
      Alert.alert('Something went wrong', 'Could not finish setup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePersistAndComplete = async (userId: string) => {
    const {
      goalTitle, commitment, selectedMarkIds, aiPackageDraft, selectedMarkTargets,
    } = useOnboardingStore.getState();
    const isAIPath = aiPackageDraft !== null && Object.keys(selectedMarkTargets).length > 0;
    const level = commitment ?? 'steady';

    // 1. Mark onboarding complete
    const remoteOk = await completeOnboarding(userId, {
      commitment: level,
      completedAt: new Date().toISOString(),
    });
    if (!remoteOk) {
      // Local completion applied; profile flag retries on next app load (uiSlice pending key).
      logger.warn('[Onboarding] profile sync deferred, will retry on next launch');
    }

    try {
      // 2. Create the goal
      const descriptionDraft = reviewDescriptionRef.current.trim() || undefined;
      const newGoal = await createGoal({
        title: goalTitle.trim() || 'My first goal',
        description: descriptionDraft,
        userId,
        isPro: false,
      });

      // 3. Create each selected mark
      for (const markId of selectedMarkIds) {
        const sugg = MARK_LIBRARY.find((m) => m.id === markId);
        if (!sugg) continue;

        const weeklyTarget = isAIPath
          ? (selectedMarkTargets[markId] ?? 3)
          : level === 'easing'
          ? (sugg.frequency_min ?? 1)
          : level === 'steady'
          ? (sugg.frequency_recommended ?? 3)
          : (sugg.frequency_max ?? 7);

        const markName = isAIPath
          ? (marksForScreen.find((m) => m.mark.id === markId)?.mark.name ?? sugg.name)
          : sugg.name;

        const newMark = await addMark({
          name: markName,
          emoji: sugg.emoji,
          color: sugg.color,
          unit: sugg.unit,
          user_id: userId,
          goal_period: 'day',
          schedule_type: 'daily',
          dailyTarget: 1,
          total: 0,
          enable_streak: false,
          sort_index: 0,
          goal_id: newGoal.id,
          frequency_kind: sugg.frequencyKind,
          frequency_min: sugg.frequency_min,
          frequency_recommended: sugg.frequency_recommended,
          frequency_max: sugg.frequency_max,
          weekly_target: weeklyTarget,
        });
        await linkMarkToGoal(newGoal.id, newMark.id);
      }

      // 4. AI path only: write the confirmed package to the cache on confirm+activate.
      // The free-use counter is incremented server-side by the ai-goal-generation
      // Edge Function at generation time (not here — the client can't write it).
      if (isAIPath && aiPackageDraft) {
        await writeGoalPackageCache(userId, goalTitle.trim(), aiPackageDraft);
      }
    } catch (err) {
      logger.error('[Onboarding] goal/mark creation failed:', err);
    }

    // 5. Reset draft + navigate to Focus
    capture(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      commitment: level,
      mark_count: selectedMarkIds.length,
      is_ai_path: isAIPath,
    });
    useOnboardingStore.getState().reset();
    router.replace('/(tabs)/focus' as any);
  };

  // ─── AI Review render ─────────────────────────────────────────────────────

  const renderAIReview = () => {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.stepContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>{"Here's what Livra suggests."}</Text>
          <Text style={styles.stepSubtitle}>Edit anything before you commit.</Text>

          {/* Editable goal title */}
          <View style={styles.fieldBlock}>
            <Text style={styles.reviewLabel}>GOAL</Text>
            <TextInput
              style={styles.input}
              value={reviewTitle}
              onChangeText={setReviewTitle}
              maxLength={80}
              placeholder="Goal title"
              placeholderTextColor={c.inkMuted}
            />
          </View>

          {/* Timeframe (display only) */}
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.reviewLabel}>TIMEFRAME</Text>
            <Text style={styles.reviewTimeframe}>{reviewWeeks} weeks</Text>
          </View>

          {/* Editable description */}
          <View style={styles.fieldBlock}>
            <Text style={styles.reviewLabel}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={styles.reviewDescriptionInput}
              value={reviewDescription}
              onChangeText={handleReviewDescriptionChange}
              placeholder="Add a note about this goal (optional)."
              placeholderTextColor={c.inkMuted}
              multiline
              maxLength={280}
            />
          </View>

          {/* Marks with why */}
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.reviewLabel}>SUGGESTED MARKS</Text>
            <View style={styles.marksList}>
              {reviewMarks.map((m, i) => {
                const selected = reviewMarkSelected.has(i);
                const resolved = resolveMarkForAIIcon(m.icon);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.reviewMarkRow, !selected && styles.markRowDeselected]}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      setReviewMarkSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) {
                          if (next.size > 1) next.delete(i);
                        } else {
                          next.add(i);
                        }
                        return next;
                      });
                    }}
                  >
                    <Text style={styles.markEmoji}>{resolved.emoji}</Text>
                    <View style={styles.markInfo}>
                      <Text style={[styles.markName, !selected && { color: c.inkMuted }]}>
                        {m.name} · {m.frequency}×/wk
                      </Text>
                      <Text style={styles.reviewMarkWhy}>{m.why}</Text>
                    </View>
                    <View
                      style={[
                        styles.markCheck,
                        selected
                          ? { backgroundColor: c.forest, borderColor: c.forest }
                          : { borderColor: c.borderMid },
                      ]}
                    >
                      {selected && <Check size={12} weight="bold" color={c.inkInverse} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <PillButton
            label="Looks good →"
            onPress={handleAIReviewConfirm}
            disabled={reviewMarkSelected.size === 0}
            style={{ ...styles.primaryBtn, opacity: reviewMarkSelected.size === 0 ? 0.4 : 1 }}
          />

          <TouchableOpacity
            style={{ alignItems: 'center', marginTop: spacing.sm }}
            onPress={handleAIReviewDismiss}
          >
            <Text style={styles.secondaryLink}>Set it up myself</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ─── Step renders ──────────────────────────────────────────────────────────

  // Step 0 — Welcome
  const renderStep0 = () => (
    <View style={styles.stepCenter}>
      <SvgLogo color={theme === 'dark' ? c.inkDark : c.forest} width={64} height={32} />
      <View style={{ marginTop: spacing.md }}>
        <LivraWordmark color={c.inkDark} fontSize={42} letterSpacing={10} />
      </View>
      <Text style={styles.tagline}>Build with intention.</Text>
      <Text style={styles.body}>
        {"The graveyard of abandoned goals is full of people who meant well.\nLet's make this one different."}
      </Text>
      <PillButton label="Get Started" onPress={advance} style={styles.primaryBtn} />
    </View>
  );

  // Step 1 — Your first goal (AI hatch stubbed/hidden)
  const renderStep1 = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepTitle}>{"What's the goal you're after?"}</Text>
        <Text style={styles.stepSubtitle}>{'Be specific. "Run a marathon" beats "get fit."'}</Text>

        <View style={styles.fieldBlock}>
          <TextInput
            style={styles.input}
            value={store.goalTitle}
            onChangeText={store.setGoalTitle}
            placeholder="Run a marathon, save $10k, learn Spanish…"
            placeholderTextColor={c.inkMuted}
            autoFocus
            maxLength={80}
            returnKeyType="next"
            onSubmitEditing={handleGoalTitleNext}
          />
        </View>

        {/* AI escape hatch */}
        <Text style={[styles.aiDisclosure, { color: c.inkMuted }]}>
          This is your one free AI draft. You can edit everything before you save it, and presets are always free.
        </Text>
        <TouchableOpacity
          style={[
            styles.aiHatch,
            (aiLoading || store.goalTitle.trim().length < MIN_GOAL_LENGTH) && { opacity: 0.4 },
          ]}
          onPress={() => handleAIGenerate()}
          disabled={aiLoading || store.goalTitle.trim().length < MIN_GOAL_LENGTH}
          activeOpacity={0.75}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color={c.accent} />
          ) : (
            <Text style={styles.aiHatchText}>✦ Let Livra suggest a plan</Text>
          )}
        </TouchableOpacity>
        {aiError ? (
          <Text style={styles.aiError}>{aiError}</Text>
        ) : (
          <Text style={styles.aiHatchSub}>
            Describe it above. Livra suggests a goal and marks. You edit before committing.
          </Text>
        )}

        <PillButton
          label="Next →"
          onPress={handleGoalTitleNext}
          disabled={!store.goalTitle.trim()}
          style={{ ...styles.primaryBtn, opacity: store.goalTitle.trim() ? 1 : 0.4 }}
        />

        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/focus' as any)}
          style={{ alignItems: 'center', marginTop: spacing.md }}
        >
          <Text style={styles.secondaryLink}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // Step 2 — Pace ("What feels right for now?")
  const renderStep2 = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.stepTitle}>{"What feels right for now?"}</Text>

      <View style={styles.paceList}>
        {PACE_OPTIONS.map((opt) => {
          const selected = (store.commitment ?? 'steady') === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.paceRow, selected && { borderColor: c.accent, borderWidth: 2 }]}
              activeOpacity={0.75}
              onPress={() => store.setCommitment(opt.value)}
            >
              <Text style={[styles.paceLabel, selected && { color: c.accent, fontFamily: fonts.sansMedium }]}>
                {opt.label}
              </Text>
              <View
                style={[
                  styles.paceRadio,
                  selected ? { backgroundColor: c.forest, borderColor: c.forest } : { borderColor: c.borderMid },
                ]}
              >
                {selected && <Check size={12} weight="bold" color={c.inkInverse} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.paceFootnote}>You can change this anytime.</Text>

      <PillButton label="Continue" onPress={handlePaceNext} style={styles.primaryBtn} />
    </ScrollView>
  );

  // Step 3 — Your marks
  const renderStep3 = () => {
    const commitment = store.commitment ?? 'steady';
    const freqPosition =
      commitment === 'easing' ? 'minimum' : commitment === 'steady' ? 'recommended' : 'maximum';

    return (
      <ScrollView
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepTitle}>Here are some marks to get started.</Text>
        <Text style={styles.stepSubtitle}>
          These are small actions that build toward your goal. Deselect any you want to skip.
        </Text>

        <View style={styles.marksList}>
          {marksForScreen.map(({ mark, weeklyTarget }) => {
            const selected = marksSelected.has(mark.id);
            return (
              <TouchableOpacity
                key={mark.id}
                style={[styles.markRow, !selected && styles.markRowDeselected]}
                activeOpacity={0.75}
                onPress={() => {
                  setMarksSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(mark.id)) {
                      if (next.size > 1) next.delete(mark.id);
                    } else {
                      next.add(mark.id);
                    }
                    return next;
                  });
                }}
              >
                <Text style={styles.markEmoji}>{mark.emoji}</Text>
                <View style={styles.markInfo}>
                  <Text style={[styles.markName, !selected && { color: c.inkMuted }]}>
                    {mark.name}
                  </Text>
                  <Text style={styles.markFreq}>
                    {frequencyLabel(weeklyTarget)} · {freqPosition}
                  </Text>
                </View>
                <View
                  style={[
                    styles.markCheck,
                    selected
                      ? { backgroundColor: c.forest, borderColor: c.forest }
                      : { borderColor: c.borderMid },
                  ]}
                >
                  {selected && <Check size={12} weight="bold" color={c.inkInverse} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.paceFootnote}>
          Free tier includes up to 3 marks per goal.
        </Text>

        <PillButton
          label={loading ? 'Setting up…' : 'Continue'}
          onPress={handleMarksNext}
          disabled={marksSelected.size === 0 || loading}
          style={styles.primaryBtn}
        />
      </ScrollView>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.fill}>
        {aiReviewActive ? renderAIReview() : (
          <>
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </>
        )}
      </View>
      {!aiReviewActive && <StepDots step={step} total={4} />}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.linen,
    },
    fill: {
      flex: 1,
    },

    // Step 0 — centered
    stepCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: 80,
    },
    tagline: {
      fontFamily: fonts.serifItalic,
      fontSize: fontSize[26],
      lineHeight: 34,
      color: c.inkDark,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      lineHeight: 24,
      color: c.inkMid,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    primaryBtn: {
      marginTop: spacing.xxl,
      height: 52,
      width: '100%',
    },
    secondaryLink: {
      fontFamily: fonts.sans,
      fontSize: fontSize.base,
      color: c.inkMid,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    // Steps 1–3 — scrollable
    stepContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: 100,
    },
    stepTitle: {
      fontFamily: fonts.serif,
      fontSize: fontSize['2xl'],
      color: c.inkDark,
      marginTop: spacing.xl,
    },
    stepSubtitle: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkMid,
      lineHeight: 22,
      marginTop: spacing.sm,
    },

    // Fields
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
    },

    // Pace screen
    paceList: {
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    paceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    paceLabel: {
      fontFamily: fonts.sans,
      fontSize: fontSize.lg,
      color: c.inkDark,
      flex: 1,
    },
    paceRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paceFootnote: {
      fontFamily: fonts.sans,
      fontSize: fontSize[13],
      color: c.inkMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },

    // Marks screen
    marksList: {
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    markRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    markRowDeselected: {
      opacity: 0.45,
    },
    markEmoji: {
      fontSize: fontSize.display,
      lineHeight: 28,
    },
    markInfo: {
      flex: 1,
    },
    markName: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.md,
      color: c.inkDark,
    },
    markFreq: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      color: c.inkMuted,
      marginTop: 2,
    },
    markCheck: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // AI disclosure (shown above the generate button)
    aiDisclosure: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      lineHeight: 18,
      textAlign: 'center' as const,
      marginTop: spacing.lg,
      paddingHorizontal: spacing.sm,
    },

    // AI hatch
    aiHatch: {
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.accent,
      borderStyle: 'dashed' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 44,
    },
    aiHatchText: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.base,
      color: c.accent,
    },
    aiHatchSub: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      color: c.inkMuted,
      textAlign: 'center' as const,
      marginTop: spacing.xs,
      lineHeight: 18,
    },
    aiError: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      color: c.danger,
      textAlign: 'center' as const,
      marginTop: spacing.xs,
      lineHeight: 18,
    },

    // Editable description in AI review
    reviewDescriptionInput: {
      minHeight: 72,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkDark,
      borderWidth: 1,
      borderColor: c.borderLight,
      textAlignVertical: 'top' as const,
    },

    // AI review
    reviewLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: fontSize.xs,
      color: c.inkMuted,
      letterSpacing: 0.8,
      marginBottom: spacing.xs,
    },
    reviewTimeframe: {
      fontFamily: fonts.sans,
      fontSize: fontSize.md,
      color: c.inkDark,
      paddingVertical: spacing.xs,
    },
    reviewMarkRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    reviewMarkWhy: {
      fontFamily: fonts.sans,
      fontSize: fontSize.sm,
      color: c.inkMuted,
      marginTop: 2,
      lineHeight: 17,
    },
  });
}
