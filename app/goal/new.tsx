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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useAuth } from '../../hooks/useAuth';
import { checkProStatus } from '../../lib/iap/iap';

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user } = useAuth();
  const addGoal = useGoalsStore(s => s.addGoal);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();
      await addGoal({
        title: trimmed,
        description: description.trim() || undefined,
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
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
          <TouchableOpacity onPress={handleSave} disabled={!title.trim() || saving}>
            <Text
              style={[
                styles.save,
                { color: title.trim() && !saving ? c.forest : c.inkMuted },
              ]}
            >
              {saving ? 'Saving…' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: c.inkMuted }]}>Goal</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: c.inkDark,
                backgroundColor: c.surface,
                borderColor: c.borderLight,
              },
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
              {
                color: c.inkDark,
                backgroundColor: c.surface,
                borderColor: c.borderLight,
              },
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
});
