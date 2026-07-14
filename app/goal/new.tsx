import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
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
  // VD-6: focus after the pageSheet transition settles — autoFocus racing the
  // modal presentation left KeyboardAvoidingView with a stale half-screen padding.
  const titleInputRef = useDeferredAutoFocus(step === 'title');

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
      <SafeAreaView style={{ flex: 1, backgroundColor: c.linen }}>
        <CommitmentScreen
          goalTitle={title}
          suggestedMarks={suggestedMarks}
          userMarks={marks}
          onConfirm={handleConfirm}
          onBack={() => setStep('title')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.cancel, { color: c.inkMuted }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.inkDark }]}>New Goal</Text>
          <TouchableOpacity onPress={handleNext} disabled={!title.trim() || saving}>
            <Text style={[styles.save, { color: title.trim() && !saving ? c.accent : c.inkMuted }]}>
              Next
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: c.inkMuted }]}>Goal</Text>
          <TextInput
            style={[
              styles.input,
              { color: c.inkDark, backgroundColor: c.surface, borderColor: c.borderLight },
            ]}
            placeholder="e.g. Run a marathon"
            placeholderTextColor={c.inkMuted}
            ref={titleInputRef}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            returnKeyType="next"
            onSubmitEditing={handleNext}
          />

          <Text style={[styles.label, { color: c.inkMuted }]}>
            Why this goal? (optional)
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.descInput,
              { color: c.inkDark, backgroundColor: c.surface, borderColor: c.borderLight },
            ]}
            placeholder="What will finishing this change for you?"
            placeholderTextColor={c.inkMuted}
            value={description}
            onChangeText={setDescription}
            maxLength={200}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={styles.aiFallbackLink}
            onPress={() => {
              // VD-6: never present the next pageSheet while the keyboard is up —
              // the incoming modal gets measured against the keyboard-shrunk area.
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
            <Text style={[styles.aiFallbackLinkText, { color: c.inkMuted }]}>
              ✦ Or let Livra suggest a plan
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  cancel: { fontSize: fontSize.md },
  save: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  form: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  descInput: { height: 80, textAlignVertical: 'top' },
  aiFallbackLink: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  aiFallbackLinkText: {
    fontSize: fontSize.sm,
  },
});
