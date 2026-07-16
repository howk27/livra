import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Keyboard,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  themedColors,
  spacing,
  fontSize,
  fonts,
  radius,
  headerControl,
  headerControlBoxLeading,
} from '../../theme/tokens';
import { applyOpacity } from '../../src/components/icons/color';
import { GoalCardPreview } from '../../components/creation/GoalCardPreview';
import { AIHatchButton } from '../../components/ui/AIHatchButton';
import { PillButton } from '../../components/ui/PillButton';
import { CATEGORY_MAP } from '../../components/ui/MarkRow';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { useSettleEntrance } from '../../hooks/useSettleEntrance';
import { checkProStatus } from '../../lib/iap/iap';
import { GOAL_LIMIT_MESSAGE } from '@/lib/copy';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
import { goalPreviewMarks } from '../../lib/creation/creationPreview';
import { CommitmentScreen, CommitmentSelection } from '../../components/CommitmentScreen';
import { MarkDefinition } from '../../lib/suggestedCounters';
import { useDeferredAutoFocus } from '../../hooks/useDeferredAutoFocus';
import { useHalfRenderProbe } from '../../hooks/useHalfRenderProbe';

type Step = 'title' | 'commitment';

// Example goals that seed the title on tap — smart defaults so the screen is
// never a blank box (ux-psychology rule 1). Each is a concrete, real goal that
// getMarksForGoal resolves to a strong mark strip, so a tap immediately shows
// the card "taking shape." They collapse the moment a title exists.
const EXAMPLE_GOALS = ['Run a 5k', 'Read nightly', 'Meditate daily', 'Save $5k'];

/**
 * One mark tile in the live "what this takes" strip. Settles in on mount
 * (useMotion, reduced-motion static) so newly-matched marks materialize as the
 * title is typed — the surface's one orchestrated motion moment (QC3-A / A1).
 * Category-accent duotone glyph on a low-alpha wash: a quiet preview, never the
 * ember spark and never a loud selection.
 */
function MarkPreviewChip({ mark, labelColor }: { mark: MarkDefinition; labelColor: string }) {
  // Mount-only entrance; the chip remounts (replaying) when a new mark matches.
  const style = useSettleEntrance(6);

  const cat = CATEGORY_MAP[mark.category] ?? CATEGORY_MAP.custom;
  const Icon = mark.icon ?? cat.Icon;

  return (
    <Animated.View
      testID="goal-mark-preview-chip"
      accessibilityLabel={mark.name}
      style={[
        styles.previewChip,
        { backgroundColor: applyOpacity(cat.accent, 0.1), borderColor: applyOpacity(cat.accent, 0.3) },
        style,
      ]}
    >
      <Icon size={14} color={cat.accent} weight="duotone" />
      <Text style={[styles.previewChipLabel, { color: labelColor }]} numberOfLines={1}>
        {mark.name}
      </Text>
    </Animated.View>
  );
}

/**
 * The live mark-preview strip: getMarksForGoal(title), capped to 3–4 faint
 * tiles. Renders nothing for a sparse title (goalPreviewMarks gate) so the
 * screen fills with the user's OWN forming plan, not a generic guess.
 */
function MarkPreviewStrip({ title }: { title: string }) {
  const c = themedColors(useEffectiveTheme());
  const marks = goalPreviewMarks(title);
  if (marks.length === 0) return null;
  return (
    <View style={styles.previewBlock} testID="goal-mark-preview">
      <Text style={[styles.previewLabel, { color: c.inkMuted }]}>What this takes</Text>
      <View style={styles.previewStrip}>
        {marks.map((m) => (
          <MarkPreviewChip key={m.id} mark={m} labelColor={c.inkMid} />
        ))}
      </View>
    </View>
  );
}

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const { user } = useAuth();
  const createGoal = useGoalsStore(s => s.createGoal);
  const addMark = useMarksStore(s => s.addMark);
  const marks = useMarksStore(s => s.marks);

  const [step, setStep] = useState<Step>('title');
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestedMarks, setSuggestedMarks] = useState<MarkDefinition[]>([]);
  // VD-6/QC2-D: focus only after the pageSheet transition settles so the
  // keyboard animation never overlaps the sheet presentation (calm entrance).
  const titleInputRef = useDeferredAutoFocus(step === 'title');
  // QC2-D diagnostic: dev-only probe — if the half-render ever reproduces
  // again, one Metro line tells us whether the CONTAINER itself is short
  // (react-native-screens native measurement) or full (something inside).
  // QC3-A: kept as a verification instrument only — the real half-render fix is
  // now the DIRECT route into this screen (no chooser-sheet → pageSheet hop).
  const onProbeLayout = useHalfRenderProbe('goal/new');

  const canProceed = !!title.trim() && !saving;

  const handleSetPlan = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSuggestedMarks(getMarksForGoal(trimmed));
    setStep('commitment');
  };

  const handleSuggestPlan = () => {
    // VD-6/QC2-D: never present the next pageSheet while the keyboard is up —
    // the incoming modal can be measured against the keyboard-shrunk area.
    Keyboard.dismiss();
    const trimmed = title.trim();
    router.replace({
      pathname: '/goal/suggest' as any,
      params: trimmed
        ? { goalText: trimmed, source: 'goal_create_fallback' }
        : { source: 'goal_create_fallback' },
    });
  };

  const handleConfirm = async (selection: CommitmentSelection) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();

      // Create goal first to get its ID
      const newGoal = await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
        linked_mark_ids: [...selection.alreadyOwnedMarkIds],
        target_mark_count: selection.unlockThreshold > 0 ? selection.unlockThreshold : null,
        tier: selection.tier,
        frequency: selection.frequency,
        method: 'manual',
      });

      // Create new marks with goal_id set
      const newMarkIds: string[] = [];
      for (const id of selection.selectedNewMarkIds) {
        const sugg = suggestedMarks.find(s => s.id === id);
        if (!sugg) continue;
        const newMark = await addMark({
          name: sugg.name,
          emoji: sugg.emoji,
          color: sugg.color,
          unit: sugg.unit,
          user_id: user.id,
          goal_period: 'day',
          schedule_type: 'daily',
          dailyTarget: 1,
          total: 0,
          enable_streak: false,
          sort_index: 0,
          goal_id: newGoal.id,
          frequency_kind: sugg.frequencyKind,
        });
        newMarkIds.push(newMark.id);
      }

      // Link new marks to goal
      if (newMarkIds.length > 0) {
        const { useGoalsStore: gs } = await import('../../state/goalsSlice');
        await Promise.all(newMarkIds.map(mId => gs.getState().linkMarkToGoal(newGoal.id, mId)));
      }

      router.back();
    } catch (err) {
      if (err instanceof GoalLimitError) {
        Alert.alert(
          'Two goals at a time',
          GOAL_LIMIT_MESSAGE,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Livra+', onPress: () => router.push('/paywall') },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not save goal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (step === 'commitment') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.linen }} onLayout={onProbeLayout}>
        <CommitmentScreen
          goalTitle={title}
          goalWhy={description.trim() || undefined}
          suggestedMarks={suggestedMarks}
          userMarks={marks}
          onConfirm={handleConfirm}
          onBack={() => setStep('title')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]} onLayout={onProbeLayout}>
      {/* QC2-D: no KeyboardAvoidingView here, deliberately. It was the root of
          the device half-render: a keyboard-driven paddingBottom applied (via
          LayoutAnimation) against a native pageSheet is the only stateful layout
          in this flow that can stick at ~keyboard height — half the sheet. All
          content is top-anchored (the primary action lives in a bottom bar, not
          a keyboard-avoiding footer), so nothing needs to avoid the keyboard;
          overflow on small devices scrolls instead. */}
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={styles.headerBtn}>
            <Text style={[styles.cancel, { color: c.inkMuted }]}>Cancel</Text>
          </TouchableOpacity>
          {/* QC3-A: the header's "Next" is gone — the primary action now lives
              in the bottom-anchored forest CTA (founder: move the action off the
              tiny header). */}
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* QC2-H "The Card Takes Shape": the REAL hollow goal card (FU-5
              treatment) is the screen's one focal point, and the caret lives
              inside it — typing renders straight into the Signature serif.
              A title alone completes the card (FU-7a). */}
          <GoalCardPreview
            testID="goal-card-preview"
            titleSlot={
              <>
                <TextInput
                  style={[styles.titleInput, { color: c.inkDark }]}
                  placeholder="Name it…"
                  placeholderTextColor={c.inkMuted}
                  ref={titleInputRef}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={80}
                  returnKeyType="next"
                  onSubmitEditing={handleSetPlan}
                />
                <TextInput
                  style={[styles.whyInput, { color: c.inkMid }]}
                  placeholder="Why it matters · optional"
                  placeholderTextColor={c.inkMuted}
                  value={description}
                  onChangeText={setDescription}
                  maxLength={200}
                  multiline
                />
              </>
            }
          />

          {/* Example goals seed the title, then collapse — the screen opens with
              a prompt, not a void (ux-psychology: smart defaults). */}
          {!title.trim() && (
            <View style={styles.exampleBlock} testID="goal-example-chips">
              <Text style={[styles.exampleLabel, { color: c.inkMuted }]}>Try one to start</Text>
              <View style={styles.exampleRow}>
                {EXAMPLE_GOALS.map((example) => (
                  <TouchableOpacity
                    key={example}
                    style={[styles.exampleChip, { backgroundColor: c.surface, borderColor: c.borderLight }]}
                    onPress={() => setTitle(example)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Start with ${example}`}
                  >
                    <Text style={[styles.exampleChipText, { color: c.inkMid }]}>{example}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* The empty space becomes a preview of the future: the marks this
              goal will take, materializing as the title is typed. */}
          <MarkPreviewStrip title={title} />
        </ScrollView>

        {/* Bottom-anchored action zone. NOT keyboard-avoiding (see QC2-D note) —
            a fixed bar, so overflow scrolls above it. The ember AIHatchButton is
            now the ONLY AI door; the forest CTA carries the manual build. */}
        <View style={[styles.footer, { borderTopColor: c.borderLight, backgroundColor: c.linen }]}>
          <AIHatchButton
            label="✦ Or let Livra suggest a plan"
            onPress={handleSuggestPlan}
            style={styles.footerHatch}
          />
          <PillButton
            label="Set the plan →"
            onPress={handleSetPlan}
            disabled={!canProceed}
            fullWidth
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  // QC4-K: paddingTop = headerControl.topGap so the Cancel control clears the
  // safe-area inset instead of sitting flush against the notch.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
    minHeight: headerControl.minTarget,
  },
  headerBtn: { ...headerControlBoxLeading },
  cancel: { fontSize: fontSize.md },
  formScroll: { flex: 1 },
  // Screen gutter = spacing.lg applied ONCE, here on the scroll content
  // (the card carries no outer margin) — 2026-07-12 width rule.
  form: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  // The card's own serif, as a caret-carrying input: same face/size/leading
  // as GoalTitle size="card" so the typed title IS the card title, live.
  titleInput: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize[22],
    lineHeight: 28,
    letterSpacing: -0.3,
    padding: 0,
  },
  whyInput: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    padding: 0,
    marginTop: spacing.sm,
    textAlignVertical: 'top',
  },
  exampleBlock: {
    marginTop: spacing.lg,
  },
  exampleLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  exampleChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  exampleChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
  },
  previewBlock: {
    marginTop: spacing.xl,
  },
  previewLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  previewStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  previewChipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  footerHatch: {
    alignSelf: 'stretch',
  },
});
