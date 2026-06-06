import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { formatDuration, formatTargetDelta } from '../../lib/goalHistory';

export default function GoalHistoryScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const completed = useMemo(
    () =>
      goals
        .filter(g => g.status === 'completed')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [goals],
  );

  const count = completed.length;
  const subtitle =
    count === 0 ? '' : count === 1 ? '1 thing you actually finished.' : `${count} things you actually finished.`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={c.inkDark} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: c.inkDark }]}>Done.</Text>
          {subtitle ? (
            <Text style={[styles.headerSubtitle, { color: c.inkMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {count === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: c.inkMuted }]}>
            Nothing here yet. Your first completed goal will show up the moment you finish one.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {completed.map(goal => (
            <View
              key={goal.id}
              style={[
                styles.card,
                { backgroundColor: c.surface, borderColor: c.borderLight },
              ]}
            >
              <Text style={[styles.goalTitle, { color: c.inkDark }]}>{goal.title}</Text>
              <View style={styles.meta}>
                {goal.completed_at ? (
                  <Text style={[styles.metaText, { color: c.inkMuted }]}>
                    {'Finished ' + format(parseISO(goal.completed_at), 'MMM d')}
                  </Text>
                ) : null}
                {goal.completed_at ? (
                  <Text style={[styles.metaText, { color: c.inkMuted }]}>
                    {'  ·  Took ' + formatDuration(goal.created_at, goal.completed_at)}
                  </Text>
                ) : null}
                {goal.completed_at && goal.target_date ? (
                  <Text style={[styles.metaText, { color: c.inkMuted }]}>
                    {'  ·  ' + formatTargetDelta(goal.completed_at, goal.target_date)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerTextWrap: { flex: 1 },
  headerSpacer: { width: 24 },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, lineHeight: 32 },
  headerSubtitle: { fontSize: fontSize.sm, marginTop: spacing.xxs },
  emptyState: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  goalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  meta: { flexDirection: 'row', flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.sm },
});
