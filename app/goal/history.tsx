import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { format, parseISO } from 'date-fns';
import {
  themedColors,
  spacing,
  fontSize,
  fontWeight,
  fonts,
  borderRadius,
  headerControl,
  headerControlBoxLeading,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { formatDuration, formatTargetDelta } from '../../lib/goalHistory';
import { getEmptyStateCopy } from '../../lib/moments/emptyState';

// M4 (PL-5): inherently firstRun — a completed goal cannot un-complete, so an
// empty history always means "never finished one yet". Single variant.
const EMPTY_HISTORY_LINE = getEmptyStateCopy('history').body;

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
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <CaretLeft size={24} color={c.inkDark} weight="bold" />
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
          <Text style={[styles.emptyText, { color: c.inkMid }]}>
            {EMPTY_HISTORY_LINE}
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
  // QC4-K: back offset from the safe-area inset by headerControl.topGap, on a
  // 44pt target (was hitSlop 8 on a 24pt icon).
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerBtn: { ...headerControlBoxLeading },
  headerTextWrap: { flex: 1 },
  // Matches headerBtn's width so the title block stays optically centred.
  headerSpacer: { width: headerControl.minTarget },
  // MED-A fallback-fix: was bare fontWeight with no family (iOS system-font
  // fallback). Screen heading, not a goal title, so it takes DM Sans bold.
  headerTitle: { fontFamily: fonts.sansBold, fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, lineHeight: 32 },
  headerSubtitle: { fontSize: fontSize.sm, marginTop: spacing.xxs },
  emptyState: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  // Mentor voice line (PL-5): serifItalic + inkMid, matching the other empty invitations.
  emptyText: { fontFamily: fonts.sansItalic, fontSize: fontSize.lg, textAlign: 'center', lineHeight: 22 },
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
  // MED-A fallback-fix: was bare fontWeight, no family. This renders the goal's
  // own name (rule 1 goal-title-keep), so it takes Cormorant semibold like GoalTitle.
  goalTitle: { fontFamily: fonts.serifSemibold, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  meta: { flexDirection: 'row', flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.sm },
});
