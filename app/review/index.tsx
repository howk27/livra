// app/review/index.tsx — the Weekly Review (WR-2).
// Spec: docs/superpowers/specs/2026-08-29-weekly-review-design.md §3, with the
// 2026-09-18 founder ruling on top: the review OPENS ON THE STORY CARD, the
// same WeeklyStoryCard that gets shared, animated in, with the colour chips
// and Share under it. The card replaced the old serif headline and 7-day dot
// strip (it carries both); prose, per-goal cards, the why in ember, the
// closing and the Livra+ tease stay below, in the app theme. Everything is derived
// at RENDER time by lib/weeklyReview/derive.ts; this file only reads, adapts
// and draws. Presented as a modal (registered in app/_layout.tsx) — remember a
// root-mounted RN <Modal> cannot present over it (OverlayPortal if ever needed).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { Skeleton } from '../../components/ui/Skeleton';

import { useAuth } from '@/hooks/useAuth';
import { useGoals } from '@/lib/data/goals';
import { useMarksByGoal } from '@/lib/data/marks';
import { useUserCheckins } from '@/lib/data/checkins';
import { asDataError } from '@/lib/data/errors';
import { dataErrorCopy } from '@/lib/copy';
import { resolveRowCadence } from '@/lib/markCadence';
// Not a Phase 2 screen: this surface was born after the seam, so it takes the
// SHARED adapter rather than growing another hand copy (lib/data/adapters.ts).
import { toMarkEvent } from '@/lib/data/adapters';
import type { GoalRow, MarkRow } from '@/lib/data/types';

import { useMomentumStore } from '../../state/momentumSlice';
import { selectAppDateKey, useAppDateStore } from '../../state/appDateSlice';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { setWeeklyReviewViewedWeek } from '../../lib/weeklyReview/arrival';
import { capture, captureException } from '../../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../../lib/analytics/events';
import { logger } from '../../lib/utils/logger';
import {
  deriveWeeklyReview,
  type DeriveWeeklyReviewInputs,
  type ReviewGoalCard,
  type WeeklyReviewData,
} from '../../lib/weeklyReview/derive';
import { weeklyReviewGate } from '../../lib/weeklyReview/gate';
import { archetypeSignalsFrom, deriveArchetype } from '../../lib/weeklyReview/archetype';
import { StoryShareControls } from '../../components/StoryShareControls';
import { STORY_CARD_HEIGHT, STORY_CARD_WIDTH, WeeklyStoryCard } from '../../components/WeeklyStoryCard';
import { STORY_PALETTES } from '../../lib/sharing/storyPalettes';
import { resolveInitialDisplayName } from '../../lib/profile/displayName';
import { closeOrHome } from '../../lib/navigation/closeOrHome';
import { useShareCardStore } from '../../state/shareCardSlice';

const EMPTY_GOAL_ROWS: GoalRow[] = [];
const EMPTY_CHECKIN_ROWS: Parameters<typeof toMarkEvent>[0][] = [];
const EMPTY_MARKS_BY_GOAL: Record<string, MarkRow[]> = {};

type ThemeColors = ReturnType<typeof themedColors>;

// ── Sections (prototype D order, top to bottom) ──────────────────────────────

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
      <Text style={[styles.body, styles.prose, { color: c.inkMid }]}>{review.prose}</Text>

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
          style={({ pressed }) => [
            styles.teaseLine,
            { borderColor: c.borderLight, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.teaseText, { color: c.inkMuted }]}>
            Livra+ adds the deeper story · trends across your weeks
          </Text>
        </Pressable>
      )}
    </>
  );
}

// One quiet fallback for both failure shapes (query error, derivation null) —
// never a crash screen (spec §8).
function QuietFallback({ c, body }: { c: ThemeColors; body: string }) {
  return (
    <>
      <Text style={[styles.kicker, { color: c.inkMuted }]}>This week</Text>
      <Text style={[styles.headline, { color: c.inkDark }]}>Your week is safe.</Text>
      <Text style={[styles.body, { color: c.inkMid }]}>{body}</Text>
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

  // `isPending`, never `isLoading`: all three reads are `enabled: userId !== ''`
  // and a DISABLED query is pending but not fetching, so `isLoading` reads false
  // while the data is genuinely absent. See lib/weeklyReview/gate.ts.
  const loading =
    goalsQuery.isPending || marksByGoalQuery.isPending || checkinsQuery.isPending;
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
      // renders instead (spec §8). The exception ships to PostHog because a
      // device-only derivation failure is otherwise invisible (2026-09-06:
      // the review derived null on the founder device with no way to see why).
      captureException(e, { surface: 'weekly_review_derive' });
      logger.warn('[WeeklyReview] derivation failed', { error: String(e) });
      return null;
    }
  }, [loading, goalsQuery.data, marksByGoalQuery.data, checkinsQuery.data, snapshots, todayStr]);

  // Auth is upstream of all three reads (each is `enabled: userId !== ''`), so
  // the gate needs to know whether it has landed — otherwise "no goals" is
  // indistinguishable from "not asked yet".
  const { user, initialized: authSettled } = useAuth();
  const activeGoalCount = (goalsQuery.data ?? EMPTY_GOAL_ROWS).filter(
    (g) => g.status === 'active' && !g.deleted_at,
  ).length;
  const gate = weeklyReviewGate({
    authSettled,
    hasUser: user != null,
    goalsPending: goalsQuery.isPending,
    marksPending: marksByGoalQuery.isPending,
    checkinsPending: checkinsQuery.isPending,
    hasError: queryError != null,
    hasReview: review !== null,
    activeGoalCount,
  });

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

  // DIAGNOSTIC (2026-09-06, remove once the founder-device null is explained):
  // the review derived null on device with active goals on the server and no
  // visibility into which input was empty. Fires once per mount, only on the
  // null path, and says exactly what the screen was looking at.
  const nullReportedRef = useRef(false);
  useEffect(() => {
    if (gate === 'waiting' || review !== null || nullReportedRef.current) return;
    nullReportedRef.current = true;
    const rows = goalsQuery.data ?? [];
    capture('weekly_review_null', {
      goal_rows: rows.length,
      active_goals: rows.filter((g) => g.status === 'active' && !g.deleted_at).length,
      marks_by_goal_keys: Object.keys(marksByGoalQuery.data ?? {}).length,
      checkin_rows: (checkinsQuery.data ?? []).length,
      had_query_error: queryError != null,
    });
  }, [gate, review, goalsQuery.data, marksByGoalQuery.data, checkinsQuery.data, queryError]);

  // Weekly Story card (spec 2026-09-15; top of the screen since 2026-09-18).
  // Share captures the on-screen card in place: no overlay, so the OS share
  // sheet presents on top of this modal (StoryShareControls header has the
  // freeze this replaced). Analytics carries ids and counts, never the goal
  // title or the archetype's words.
  const storyCardRef = useRef<View>(null);
  const [storySettled, setStorySettled] = useState(false);
  const onStorySettled = useCallback(() => setStorySettled(true), []);
  // Breathing glow (2026-09-21): Share photographs the live card, so the glow
  // stops before the snapshot. Switching `breathe` off snaps the card to rest;
  // two frames later that rest frame is what is on glass.
  const [capturing, setCapturing] = useState(false);
  const settleForCapture = useCallback(
    () =>
      new Promise<void>((resolve) => {
        setCapturing(true);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    [],
  );
  const releaseAfterCapture = useCallback(() => setCapturing(false), []);
  const { width: windowWidth } = useWindowDimensions();
  const heroWidth = windowWidth - spacing.lg * 2;
  const heroScale = heroWidth / STORY_CARD_WIDTH;
  const heroHeight = Math.round(STORY_CARD_HEIGHT * heroScale);
  const storyPalette = useShareCardStore((s) => s.storyPalette);
  const setStoryPalette = useShareCardStore((s) => s.setStoryPalette);
  const loadStoryPalette = useShareCardStore((s) => s.loadStoryPalette);
  const storyPrefs = useShareCardStore((s) => s.storyPrefs);
  const setStoryPref = useShareCardStore((s) => s.setStoryPref);
  const loadStoryPrefs = useShareCardStore((s) => s.loadStoryPrefs);
  useEffect(() => {
    loadStoryPalette();
    loadStoryPrefs();
  }, [loadStoryPalette, loadStoryPrefs]);

  // PRIVACY: the signature takes a genuinely SAVED display name only.
  // resolveFirstName (the greeting's resolver) falls back to the email prefix
  // — fine on the person's own screen, a handle published to strangers on a
  // shared image. Never swap this for that (spec 2026-09-20).
  const savedName = useMemo(() => resolveInitialDisplayName(null, user?.user_metadata), [user]);
  const signatureName = savedName ? (savedName.split(' ')[0] ?? null) : null;

  // The goal the week is deepest into carries the most meaning on the card.
  const deepestGoal = useMemo(() => {
    const goals = review?.goals ?? [];
    if (goals.length === 0) return null;
    const deepest = goals.reduce((a, b) => (b.weeksIn > a.weeksIn ? b : a));
    return { title: deepest.title, weeksIn: deepest.weeksIn };
  }, [review]);

  const archetype = useMemo(
    () => (review ? deriveArchetype(archetypeSignalsFrom(review)) : null),
    [review],
  );

  const handleShared = useCallback(() => {
    if (!review || !archetype) return;
    capture(ANALYTICS_EVENTS.WEEKLY_REVIEW_SHARED, {
      week_start: review.weekStart,
      archetype_id: archetype.id,
      palette: storyPalette,
      days_active: review.daysActiveCount,
      // Booleans only: what people keep on, never what it said.
      show_name: storyPrefs.showName && signatureName !== null,
      show_weeks_in: storyPrefs.showWeeksIn,
      show_goal_title: storyPrefs.showGoalTitle,
    });
  }, [review, archetype, storyPalette, storyPrefs, signatureName]);

  // Nothing to review → quiet redirect to Focus (spec §8). The gate is what
  // guarantees "only after the reads settle" — the inline version of this test
  // used `isLoading` and so fired on the very first render, before auth had
  // hydrated, which is why `livra://review` bounced (decisions.md 2026-09-08).
  if (gate === 'redirect') {
    return <Redirect href="/(tabs)/focus" />;
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: c.linen }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => closeOrHome(router)}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={4}
        >
          <X size={24} color={c.inkMid} weight="regular" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {gate === 'waiting' ? (
          <ReviewSkeleton />
        ) : gate === 'fallback' || review === null ? (
          <QuietFallback
            c={c}
            body={
              queryError ??
              'The review could not be drawn just now. Everything you logged is still here, and this page will be ready next time you open it.'
            }
          />
        ) : (
          <>
            {archetype !== null && (
              <>
                {/* The card is laid out at its true 360x640 and only this
                    wrapper scales it to the column, so the capture (the
                    card's own layer at its own bounds) exports full size. */}
                <View style={[styles.hero, { width: heroWidth, height: heroHeight }]}>
                  <View
                    style={{
                      width: STORY_CARD_WIDTH,
                      height: STORY_CARD_HEIGHT,
                      transform: [
                        { translateX: -(STORY_CARD_WIDTH - heroWidth) / 2 },
                        { translateY: -(STORY_CARD_HEIGHT - heroHeight) / 2 },
                        { scale: heroScale },
                      ],
                    }}
                  >
                    <WeeklyStoryCard
                      ref={storyCardRef}
                      weekLabel={review.weekLabel}
                      archetype={archetype}
                      daysActive={review.daysActive}
                      daysActiveCount={review.daysActiveCount}
                      marksLogged={review.marksLogged}
                      deepestGoal={deepestGoal}
                      signatureName={storyPrefs.showName ? signatureName : null}
                      showWeeksIn={storyPrefs.showWeeksIn}
                      showGoalTitle={storyPrefs.showGoalTitle}
                      palette={STORY_PALETTES[storyPalette]}
                      animate
                      onEntranceDone={onStorySettled}
                      breathe={storySettled && !capturing}
                    />
                  </View>
                </View>
                <StoryShareControls
                  cardRef={storyCardRef}
                  palette={storyPalette}
                  onPaletteChange={setStoryPalette}
                  prefs={storyPrefs}
                  onPrefChange={setStoryPref}
                  canSign={signatureName !== null}
                  ready={storySettled}
                  onShared={handleShared}
                  onBeforeCapture={settleForCapture}
                  onAfterCapture={releaseAfterCapture}
                />
              </>
            )}
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
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  prose: { marginTop: spacing.lg },
  hero: { borderRadius: radius.lg, overflow: 'hidden' },

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
