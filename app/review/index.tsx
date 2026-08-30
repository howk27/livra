// app/review/index.tsx — the Weekly Review (WR-2).
// Spec: docs/superpowers/specs/2026-08-29-weekly-review-design.md §3 — the
// confirmed prototype D "Letter at a Glance" is the visual contract: A's voice
// opens and closes (serif headline + prose + the why in ember), B's structure
// carries the middle (7-day dot strip + per-goal cards). Everything is derived
// at RENDER time by lib/weeklyReview/derive.ts; this file only reads, adapts
// and draws. Presented as a modal (registered in app/_layout.tsx) — remember a
// root-mounted RN <Modal> cannot present over it (OverlayPortal if ever needed).

import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'phosphor-react-native';

import {
  fonts,
  fontSize,
  headerControl,
  headerControlBoxTrailing,
  radius,
  shadow,
  spacing,
  themedColors,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';
import { Skeleton } from '../../components/ui/Skeleton';

import { useGoals } from '@/lib/data/goals';
import { useMarksByGoal } from '@/lib/data/marks';
import { useUserCheckins } from '@/lib/data/checkins';
import { asDataError } from '@/lib/data/errors';
import { dataErrorCopy } from '@/lib/copy';
import { resolveRowCadence } from '@/lib/markCadence';
import type { GoalRow, MarkEventRow, MarkRow } from '@/lib/data/types';

import { useMomentumStore } from '../../state/momentumSlice';
import { selectAppDateKey, useAppDateStore } from '../../state/appDateSlice';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { setWeeklyReviewViewedWeek } from '../../lib/weeklyReview/arrival';
import { capture } from '../../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../../lib/analytics/events';
import { logger } from '../../lib/utils/logger';
import {
  deriveWeeklyReview,
  type DeriveWeeklyReviewInputs,
  type ReviewGoalCard,
  type WeeklyReviewData,
} from '../../lib/weeklyReview/derive';
import type { MarkEvent } from '../../types';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const EMPTY_GOAL_ROWS: GoalRow[] = [];
const EMPTY_CHECKIN_ROWS: MarkEventRow[] = [];
const EMPTY_MARKS_BY_GOAL: Record<string, MarkRow[]> = {};

// Same strangler-seam bridge every reading screen carries (app/(tabs)/focus.tsx
// precedent): query rows → the old event model the pure week helpers are typed
// against. Deleted with the seam.
function toMarkEvent(row: MarkEventRow): MarkEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.mark_id,
    event_type: row.event_type as MarkEvent['event_type'],
    amount: row.amount ?? 1,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

type ThemeColors = ReturnType<typeof themedColors>;

// ── Sections (prototype D order, top to bottom) ──────────────────────────────

function DayStrip({ daysActive, c }: { daysActive: boolean[]; c: ThemeColors }) {
  return (
    <View style={styles.dayStrip}>
      {daysActive.map((active, i) => (
        <View key={i} style={styles.dayCell}>
          <View
            style={[
              styles.dayDot,
              // A quiet day is visually NEUTRAL (consistency-engine precedent) —
              // never red or amber.
              active
                ? { backgroundColor: c.forest }
                : { backgroundColor: applyOpacity(c.inkMuted, 0.18) },
            ]}
          />
          <Text style={[styles.dayLabel, { color: c.inkMuted }]}>{DAY_LETTERS[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function GoalCard({ goal, c, theme }: { goal: ReviewGoalCard; c: ThemeColors; theme: 'light' | 'dark' }) {
  return (
    <View
      style={[
        styles.goalCard,
        { backgroundColor: c.cardRaised },
        // A raised card is lighter than its page in both themes; light alone
        // earns the warm shadow (cardRaised rule, design-decisions 2026-08-03).
        theme === 'light' ? shadow.card : null,
      ]}
    >
      <Text style={[styles.goalTitle, { color: c.inkDark }]}>{goal.title}</Text>
      <Text style={[styles.goalMeta, { color: c.inkMuted }]}>
        {goal.weeksIn === 0 ? 'week one' : `week ${goal.weeksIn}`}
      </Text>
      {goal.marks.map((m) => (
        <View key={m.markId} style={styles.markRow}>
          <Text style={[styles.markName, { color: c.inkMid }]}>{m.name}</Text>
          {/* emberInk, not ember: 15px medium on light cardRaised chrome is the
              exact small-text duty plain ember is barred from (Tokens 2026-07-26). */}
          <Text style={[styles.markCount, { color: m.met ? c.emberInk : c.inkMuted }]}>
            {/* a zero is never rendered (ux-psychology rule 2, hard) */}
            {m.done === 0 ? 'not yet' : `${m.done} of ${m.target}`}
            {m.met ? '  ✓' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReviewBody({ review, c, theme, showTease, onTease }: {
  review: WeeklyReviewData;
  c: ThemeColors;
  theme: 'light' | 'dark';
  showTease: boolean;
  onTease: () => void;
}) {
  return (
    <>
      <Text style={[styles.kicker, { color: c.inkMuted }]}>{review.weekLabel}</Text>
      <Text style={[styles.headline, { color: c.inkDark }]}>{review.headline}</Text>
      <Text style={[styles.body, { color: c.inkMid }]}>{review.prose}</Text>

      <DayStrip daysActive={review.daysActive} c={c} />

      {review.goals.map((g) => (
        <GoalCard key={g.goalId} goal={g} c={c} theme={theme} />
      ))}

      {review.why !== null && (
        <Text style={[styles.why, { color: c.ember }]}>“{review.why}”</Text>
      )}
      <Text style={[styles.body, { color: c.inkMid }]}>{review.closing}</Text>

      {showTease && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Livra Plus adds trends across your weeks"
          onPress={onTease}
          style={[styles.teaseLine, { borderColor: c.borderLight }]}
        >
          <Text style={[styles.teaseText, { color: c.inkMuted }]}>
            Livra+ adds the deeper story · trends across your weeks
          </Text>
        </Pressable>
      )}
    </>
  );
}

function ReviewSkeleton() {
  return (
    <View>
      <Skeleton height={14} width={140} />
      <Skeleton height={34} width="80%" style={styles.skelGap} />
      <Skeleton height={44} style={styles.skelGap} />
      <Skeleton height={140} style={styles.skelGapLg} />
      <Skeleton height={140} style={styles.skelGap} />
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function WeeklyReviewScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { isProUnlocked } = useIapSubscriptions();

  const goalsQuery = useGoals();
  const marksByGoalQuery = useMarksByGoal();
  const checkinsQuery = useUserCheckins();
  const snapshots = useMomentumStore((s) => s.snapshots);

  const appDateKey = useAppDateStore(selectAppDateKey);
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

  const loading =
    goalsQuery.isLoading || marksByGoalQuery.isLoading || checkinsQuery.isLoading;
  const queryError = dataErrorCopy(
    asDataError(goalsQuery.error ?? marksByGoalQuery.error ?? checkinsQuery.error),
  );

  const review = useMemo<WeeklyReviewData | null>(() => {
    if (loading) return null;
    const goalRows = (goalsQuery.data ?? EMPTY_GOAL_ROWS).filter((g) => !g.deleted_at);
    const marksByGoalRows = marksByGoalQuery.data ?? EMPTY_MARKS_BY_GOAL;
    const marksByGoal: DeriveWeeklyReviewInputs['marksByGoal'] = {};
    for (const [goalId, rows] of Object.entries(marksByGoalRows)) {
      marksByGoal[goalId] = rows
        .filter((m) => !m.deleted_at)
        .map((m) => ({
          id: m.id,
          name: m.name,
          weekly_target: resolveRowCadence(m, m).weekly_target,
          dailyTarget: m.dailyTarget,
        }));
    }
    try {
      return deriveWeeklyReview({
        todayStr,
        goals: goalRows,
        marksByGoal,
        events: (checkinsQuery.data ?? EMPTY_CHECKIN_ROWS).map(toMarkEvent),
        snapshots,
      });
    } catch (e) {
      // Derivation must never take the screen down — the quiet fallback below
      // renders instead (spec §8).
      logger.warn('[WeeklyReview] derivation failed', { error: String(e) });
      return null;
    }
  }, [loading, goalsQuery.data, marksByGoalQuery.data, checkinsQuery.data, snapshots, todayStr]);

  // WR-3: viewing IS the dismissal — recording the reviewed weekStart clears
  // the Focus arrival card for this week. WR-5: the same once-per-week moment
  // is the opened event; effect deps make both fire once per weekStart.
  const params = useLocalSearchParams<{ source?: string }>();
  const source =
    params.source === 'notification' || params.source === 'focus_card'
      ? params.source
      : 'other';
  const viewedWeekStart = review?.weekStart ?? null;
  const daysActiveCount = review?.daysActiveCount ?? 0;
  const marksLogged = review?.marksLogged ?? 0;
  const firstWeek = review?.firstWeek ?? false;
  useEffect(() => {
    if (!viewedWeekStart) return;
    void setWeeklyReviewViewedWeek(viewedWeekStart);
    capture(ANALYTICS_EVENTS.WEEKLY_REVIEW_OPENED, {
      source,
      week_start: viewedWeekStart,
      days_active: daysActiveCount,
      marks_logged: marksLogged,
      first_week: firstWeek,
    });
    // The counts describe the week being opened; they ride the weekStart dep on
    // purpose so a background refetch cannot double-fire the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedWeekStart]);

  // Nothing to review → quiet redirect to Focus (spec §8). Only after loading
  // settles, so a cold open never bounces mid-fetch.
  if (!loading && !queryError && review === null && (goalsQuery.data ?? []).filter((g) => g.status === 'active' && !g.deleted_at).length === 0) {
    return <Redirect href="/(tabs)/focus" />;
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.linen }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={4}
        >
          <X size={24} color={c.inkMid} weight="regular" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ReviewSkeleton />
        ) : queryError ? (
          <>
            <Text style={[styles.kicker, { color: c.inkMuted }]}>This week</Text>
            <Text style={[styles.headline, { color: c.inkDark }]}>Your week is safe.</Text>
            <Text style={[styles.body, { color: c.inkMid }]}>{queryError}</Text>
          </>
        ) : review === null ? (
          <>
            <Text style={[styles.kicker, { color: c.inkMuted }]}>This week</Text>
            <Text style={[styles.headline, { color: c.inkDark }]}>Your week is safe.</Text>
            <Text style={[styles.body, { color: c.inkMid }]}>
              The review could not be drawn just now. Everything you logged is
              still here, and this page will be ready next time you open it.
            </Text>
          </>
        ) : (
          <ReviewBody
            review={review}
            c={c}
            theme={theme}
            showTease={!isProUnlocked}
            onTease={() => {
              capture(ANALYTICS_EVENTS.WEEKLY_REVIEW_PAYWALL_TAPPED, {
                week_start: review.weekStart,
              });
              router.push('/paywall');
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: headerControl.topGap,
  },
  headerBtn: { ...headerControlBoxTrailing },
  // Screen gutter spacing.lg applied ONCE, on the scroll wrapper (2026-07-12 rule).
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  headline: {
    fontFamily: fonts.serif,
    fontSize: fontSize['3xl'],
    lineHeight: 38,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.lg,
    lineHeight: 24,
    marginBottom: spacing.md,
  },

  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  dayCell: { alignItems: 'center', gap: 6 },
  dayDot: { width: 18, height: 18, borderRadius: radius.full },
  dayLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.xs },

  goalCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  goalTitle: { fontFamily: fonts.serifSemibold, fontSize: fontSize.xl },
  goalMeta: { fontFamily: fonts.sans, fontSize: fontSize.sm, marginBottom: spacing.sm },
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  markName: { fontFamily: fonts.sans, fontSize: fontSize.md },
  markCount: { fontFamily: fonts.sansMedium, fontSize: fontSize.md },

  why: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.xl,
    lineHeight: 28,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  teaseLine: {
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    minHeight: headerControl.minTarget,
    justifyContent: 'center',
  },
  teaseText: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.base,
    textAlign: 'center',
  },

  skelGap: { marginTop: spacing.md },
  skelGapLg: { marginTop: spacing.lg },
});
