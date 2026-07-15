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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { themedColors, spacing, fontSize, fontWeight, fonts } from '../../theme/tokens';
import { GoalCardPreview } from '../../components/creation/GoalCardPreview';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { checkProStatus } from '../../lib/iap/iap';
import { GOAL_LIMIT_MESSAGE } from '@/lib/copy';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
import { CommitmentScreen, CommitmentSelection } from '../../components/CommitmentScreen';
import { MarkDefinition } from '../../lib/suggestedCounters';
import { useDeferredAutoFocus } from '../../hooks/useDeferredAutoFocus';
import { useHalfRenderProbe } from '../../hooks/useHalfRenderProbe';

type Step = 'title' | 'commitment';

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
  const onProbeLayout = useHalfRenderProbe('goal/new');

  const handleNext = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSuggestedMarks(getMarksForGoal(trimmed));
    setStep('commitment');
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
          content on this step is top-anchored (the primary action lives in the
          header), so nothing needs to avoid the keyboard; overflow on small
          devices scrolls instead. */}
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.cancel, { color: c.inkMuted }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNext} disabled={!title.trim() || saving}>
            <Text style={[styles.save, { color: title.trim() && !saving ? c.accent : c.inkMuted }]}>
              Next
            </Text>
          </TouchableOpacity>
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
                  onSubmitEditing={handleNext}
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

          <Text style={[styles.benchLine, { color: c.inkMuted }]}>
            Your goal card · exactly as you will see it every day.
          </Text>

          <TouchableOpacity
            style={styles.aiFallbackLink}
            onPress={() => {
              // VD-6/QC2-D: never present the next pageSheet while the keyboard
              // is up — the incoming modal can be measured against the
              // keyboard-shrunk area.
              Keyboard.dismiss();
              const trimmed = title.trim();
              router.replace({
                pathname: '/goal/suggest' as any,
                params: trimmed
                  ? { goalText: trimmed, source: 'goal_create_fallback' }
                  : { source: 'goal_create_fallback' },
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Or let Livra suggest a plan"
          >
            {/* VD-5: ember ✦ marks the AI voice; the link text stays inkMid
                because ember fails contrast at this small size (VD-1 rule). */}
            <Text style={[styles.aiFallbackLinkText, { color: c.inkMid }]}>
              <Text style={{ color: c.ember }}>{'✦ '}</Text>
              Or let Livra suggest a plan
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancel: { fontSize: fontSize.md },
  save: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
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
  benchLine: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  aiFallbackLink: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiFallbackLinkText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
