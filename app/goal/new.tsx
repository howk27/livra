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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { checkProStatus } from '../../lib/iap/iap';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
import { MarkDefinition } from '../../lib/suggestedCounters';
import type { Mark } from '../../types';

type Step = 'title' | 'marks';

function isAlreadyOwned(suggested: MarkDefinition, userMarks: Mark[]): Mark | undefined {
  return userMarks.find(
    m =>
      m.name.toLowerCase() === suggested.name.toLowerCase() ||
      (m as any).icon === suggested.id,
  );
}

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user } = useAuth();
  const createGoal = useGoalsStore(s => s.createGoal);
  const addMark = useMarksStore(s => s.addMark);
  const marks = useMarksStore(s => s.marks);

  const [step, setStep] = useState<Step>('title');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestedMarks, setSuggestedMarks] = useState<MarkDefinition[]>([]);
  const [selectedNewMarkIds, setSelectedNewMarkIds] = useState<Set<string>>(new Set());

  const handleNext = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const suggestions = getMarksForGoal(trimmed);
    setSuggestedMarks(suggestions);
    const newIds = suggestions
      .filter(s => !isAlreadyOwned(s, marks))
      .map(s => s.id);
    setSelectedNewMarkIds(new Set(newIds));
    setStep('marks');
  };

  const toggleMarkSelection = (id: string) => {
    setSelectedNewMarkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();

      const ownedAssociated = suggestedMarks
        .map(s => isAlreadyOwned(s, marks))
        .filter(Boolean) as Mark[];

      const newMarkIds: string[] = [];
      for (const suggId of selectedNewMarkIds) {
        const sugg = suggestedMarks.find(s => s.id === suggId);
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
          enable_streak: true,
          sort_index: 0,
        });
        newMarkIds.push(newMark.id);
      }

      const linked_mark_ids = [
        ...ownedAssociated.map(m => m.id),
        ...newMarkIds,
      ];

      await createGoal({
        title: trimmed,
        description: description.trim() || undefined,
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
        linked_mark_ids,
      });

      router.back();
    } catch (err) {
      if (err instanceof GoalLimitError) {
        Alert.alert(
          'Goal limit reached',
          'The free plan supports up to 3 goals. Upgrade to Livra+ for unlimited.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/paywall') },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not save goal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (step === 'marks') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('title')}>
            <Text style={[styles.cancel, { color: c.inkMuted }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.inkDark }]}>Pick Marks</Text>
          <TouchableOpacity onPress={handleCreate} disabled={saving}>
            <Text style={[styles.save, { color: saving ? c.inkMuted : c.forest }]}>
              {saving ? 'Saving…' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.markList}>
          <Text style={[styles.markSubheader, { color: c.inkMuted }]}>
            These are the daily actions that move this goal forward.
          </Text>

          {suggestedMarks.map(sugg => {
            const owned = isAlreadyOwned(sugg, marks);
            const isSelected = selectedNewMarkIds.has(sugg.id);

            return (
              <TouchableOpacity
                key={sugg.id}
                style={[
                  styles.markCard,
                  {
                    backgroundColor: c.surface,
                    borderColor: owned
                      ? c.forest
                      : isSelected
                      ? c.forest
                      : c.borderLight,
                  },
                ]}
                onPress={() => {
                  if (owned) {
                    router.push(`/mark/${owned.id}` as any);
                  } else {
                    toggleMarkSelection(sugg.id);
                  }
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.markEmoji}>{sugg.emoji}</Text>
                <Text style={[styles.markName, { color: c.inkDark }]}>{sugg.name}</Text>
                {owned ? (
                  <View style={[styles.ownedBadge, { backgroundColor: c.forest + '22', borderColor: c.forest }]}>
                    <Text style={[styles.ownedBadgeText, { color: c.forest }]}>✓ Already tracking</Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? c.forest : c.borderMid,
                        backgroundColor: isSelected ? c.forest : 'transparent',
                      },
                    ]}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity onPress={() => router.push('/mark/new' as any)} style={styles.browseLink}>
            <Text style={[styles.browseLinkText, { color: c.forest }]}>Browse all marks</Text>
          </TouchableOpacity>
        </ScrollView>
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
          <TouchableOpacity onPress={handleNext} disabled={!title.trim()}>
            <Text style={[styles.save, { color: title.trim() ? c.forest : c.inkMuted }]}>
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
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            autoFocus
            returnKeyType="next"
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
  markList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  markSubheader: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  markCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  markEmoji: { fontSize: 22, width: 28 },
  markName: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  ownedBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ownedBadgeText: { fontSize: 11, fontWeight: fontWeight.medium },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: fontWeight.bold },
  browseLink: { alignItems: 'center', marginTop: spacing.md, paddingVertical: spacing.sm },
  browseLinkText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
