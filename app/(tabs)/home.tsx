import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  SectionList,
  Image,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { SortableMarkList } from '../../components/SortableMarkList';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useFABContext } from './_layout';
import { useCounters } from '../../hooks/useCounters';
import { useCountersStore } from '../../state/countersSlice';
import { HabitRowCounter, getCompressedProgress } from '../../components/HabitRow';
import { EmptyState } from '../../components/EmptyState';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { execute } from '../../lib/db';
import { Counter } from '../../types';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useNotifications } from '../../hooks/useNotifications';
import { AppText } from '../../components/Typography';
import { logger } from '../../lib/utils/logger';
import { getAvatarUrl, refreshAvatarUrl } from '../../lib/storage/avatarStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { useEventsStore } from '../../state/eventsSlice';
import { useDailyTrackingStore } from '../../state/dailyTrackingSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { subDays } from 'date-fns';
import { HomeHeader } from '../../components/HomeHeader';
import { WeeklySummaryStrip } from '../../components/WeeklySummaryStrip';
import { ActiveGoalBanner } from '../../components/ActiveGoalBanner';
import { PaceBanner } from '../../components/PaceBanner';
import { usePaceAlert } from '../../hooks/usePaceAlert';
import { CheckinButton } from '../../components/CheckinButton';
import type { HeaderState, WeekArcState, PostLogState } from '../../lib/copy';
import { deriveStreakForMark } from '../../hooks/useStreaks';
import { Logo } from '../../components/Logo';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_OUTER_PADDING = spacing.md;
const GRID_COLUMN_GAP = spacing.sm;
const GRID_ROW_GAP = spacing.sm;
const GRID_ITEM_HEIGHT = 178;
const GRID_AVAILABLE_WIDTH = SCREEN_WIDTH - GRID_OUTER_PADDING * 2;
const GRID_BLOCK_WIDTH = GRID_AVAILABLE_WIDTH / 2;

export default function HomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();

  const { counters, loading, incrementCounter, deleteCounter } = useCounters();
  const { sync } = useSync();
  const { updateSmartNotifications, permissionGranted } = useNotifications();
  const paceAlert = usePaceAlert();
  const [localCounters, setLocalCounters] = useState<Counter[]>([]);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const { isEditMode, setIsEditMode } = useFABContext();
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const scrollViewRef = useRef<ScrollView>(null);

  // Sync local state with counters from store
  // Deduplicate by ID to prevent React key errors
  // Use useMemo to avoid expensive work on every render
  const uniqueCounters = useMemo(() => {
    const countersMap = new Map<string, Counter>();
    for (const counter of counters) {
      const existing = countersMap.get(counter.id);
      if (!existing || new Date(counter.updated_at) > new Date(existing.updated_at)) {
        countersMap.set(counter.id, counter);
      }
    }
    return Array.from(countersMap.values());
  }, [counters]);

  useEffect(() => {
    setLocalCounters(uniqueCounters);
  }, [uniqueCounters]);

  // When returning from mark edit/detail, realign list rows with the store (avoids stale rows)
  useFocusEffect(
    useCallback(() => {
      if (isEditMode) return;
      setLocalCounters(uniqueCounters);
    }, [uniqueCounters, isEditMode])
  );

  // Reset local counters when entering edit mode to ensure fresh data
  useEffect(() => {
    if (isEditMode) {
      // Force a small delay to ensure SortableMarkList re-initializes with fresh data
      // Deduplicate counters to prevent duplicate key errors
      const timer = setTimeout(() => {
        const countersMap = new Map<string, Counter>();
        for (const counter of counters) {
          const existing = countersMap.get(counter.id);
          if (!existing || new Date(counter.updated_at) > new Date(existing.updated_at)) {
            countersMap.set(counter.id, counter);
          }
        }
        setLocalCounters(Array.from(countersMap.values()));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditMode, counters]);

  // Reschedule Livra local reminders when marks list changes (coalesced in `livraLocalNotificationOwner`).
  useEffect(() => {
    const setupNotifications = async () => {
      if (!permissionGranted || counters.length === 0) return;
      await updateSmartNotifications(user?.id);
    };
    void setupNotifications();
  }, [counters, permissionGranted, user?.id, updateSmartNotifications]);

  // Load profile image on mount and when user changes
  useEffect(() => {
    const loadProfileImage = async () => {
      try {
        if (user?.id) {
          // If user is logged in, try to load from Supabase storage
          const avatarUrl = await getAvatarUrl(user.id, 3600); // 1 hour expiry
          
          if (avatarUrl) {
            setProfileImageUri(avatarUrl);
            // Also store locally as cache
            await AsyncStorage.setItem('profile_image_uri', avatarUrl);
            return;
          }
          
          // If not found in Supabase, check local storage as fallback
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            // Only use local URI if it's a file path (not a URL)
            setProfileImageUri(storedUri);
          } else if (storedUri && storedUri.startsWith('http')) {
            // Try to refresh expired signed URL
            const refreshedUrl = await refreshAvatarUrl(user.id, storedUri, 3600);
            if (refreshedUrl) {
              setProfileImageUri(refreshedUrl);
              await AsyncStorage.setItem('profile_image_uri', refreshedUrl);
            } else {
              // URL expired and refresh failed, clear it
              await AsyncStorage.removeItem('profile_image_uri');
              setProfileImageUri(null);
            }
          }
        } else {
          // If not logged in, use local storage only
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            setProfileImageUri(storedUri);
          }
        }
      } catch (error) {
        logger.error('Error loading profile image:', error);
        // Fallback to local storage
        try {
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            setProfileImageUri(storedUri);
          }
        } catch (fallbackError) {
          logger.error('Error loading from local storage:', fallbackError);
        }
      }
    };
    loadProfileImage();
  }, [user?.id]);

  // Listen for profile image updates from settings screen
  // Reload when screen comes into focus (user might have updated profile picture in settings)
  useFocusEffect(
    useCallback(() => {
      const checkProfileImage = async () => {
        try {
          if (user?.id) {
            // Refresh avatar URL when screen comes into focus
            const avatarUrl = await getAvatarUrl(user.id, 3600);
            if (avatarUrl && avatarUrl !== profileImageUri) {
              setProfileImageUri(avatarUrl);
              await AsyncStorage.setItem('profile_image_uri', avatarUrl);
            } else if (!avatarUrl && profileImageUri) {
              // Avatar was deleted, clear it
              setProfileImageUri(null);
              await AsyncStorage.removeItem('profile_image_uri');
            }
          } else {
            // Fallback to local storage check
            const storedUri = await AsyncStorage.getItem('profile_image_uri');
            if (storedUri && storedUri !== profileImageUri && !storedUri.startsWith('http')) {
              setProfileImageUri(storedUri);
            }
          }
        } catch (error) {
          logger.error('Error checking profile image:', error);
        }
      };
      
      checkProfileImage();
    }, [profileImageUri, user?.id])
  );

  // ── Daily Progress (Phase 2) ──────────────────────────────
  const allEvents = useEventsStore(s => s.events);
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

  // Today increment totals — single source for rows + Daily Momentum (avoids drift vs list).
  const todayCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    allEvents.forEach((e) => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      if (e.occurred_local_date !== todayStr) return;
      map.set(e.mark_id, (map.get(e.mark_id) ?? 0) + (e.amount ?? 1));
    });
    return map;
  }, [allEvents, todayStr]);

  /** Per-mark streak from event history only (same definition as detail screen and post-sync recompute). */
  const streakDerivedByMark = useMemo(() => {
    const map = new Map<string, { current: number; longest: number }>();
    uniqueCounters.forEach((c) => {
      if (c.deleted_at) return;
      const d = deriveStreakForMark(c.id, allEvents, c.enable_streak);
      if (d) map.set(c.id, { current: d.current, longest: d.longest });
    });
    return map;
  }, [uniqueCounters, allEvents, appDateKey]);

  // Same pool as the home list (localCounters) so Daily Momentum never drifts from rendered rows.
  const marksForDailyMomentum = useMemo(
    () => localCounters.filter((c) => !c.deleted_at),
    [localCounters],
  );

  const activeMarkCount = marksForDailyMomentum.length;

  // Daily momentum = count of marks fully completed today (todayCount >= dailyTarget), not tap sum.
  const completedMarksToday = useMemo(() => {
    let n = 0;
    marksForDailyMomentum.forEach((c) => {
      const todayCount = todayCountsMap.get(c.id) ?? 0;
      if (todayCount >= resolveDailyTarget(c)) n++;
    });
    return n;
  }, [marksForDailyMomentum, todayCountsMap, resolveDailyTarget]);

  // ── Overall streak: consecutive days with any activity ──────────
  const overallStreakDays = useMemo(() => {
    let streak = 0;
    const anchor = getAppDate();
    for (let i = 0; i < 365; i++) {
      const dateStr = formatDate(subDays(anchor, i));
      const hasActivity = allEvents.some(
        e => e.occurred_local_date === dateStr && !e.deleted_at && e.event_type === 'increment',
      );
      if (hasActivity) streak++;
      else break;
    }
    return streak;
  }, [allEvents, appDateKey]);

  const incompleteMarksToday = useMemo(
    () => Math.max(0, activeMarkCount - completedMarksToday),
    [activeMarkCount, completedMarksToday],
  );

  const prevOverallStreakRef = useRef<number | null>(null);
  const [streakPulseToken, setStreakPulseToken] = useState(0);
  useEffect(() => {
    if (prevOverallStreakRef.current === null) {
      prevOverallStreakRef.current = overallStreakDays;
      return;
    }
    if (overallStreakDays > prevOverallStreakRef.current) {
      setStreakPulseToken((x) => x + 1);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
    prevOverallStreakRef.current = overallStreakDays;
  }, [overallStreakDays]);

  // ── 3/3 ceremony token ───────────────────────────────────────────────
  const [ceremonyToken, setCeremonyToken] = useState(0);
  const prevCompletedRef = useRef(0);
  useEffect(() => {
    if (completedMarksToday >= activeMarkCount && activeMarkCount > 0 && completedMarksToday > prevCompletedRef.current) {
      setCeremonyToken(t => t + 1);
    }
    prevCompletedRef.current = completedMarksToday;
  }, [completedMarksToday, activeMarkCount]);

  // ── Days since last log (for MarkCard State 5) ────────────────────────
  const daysSinceLastLogByMark = useMemo(() => {
    const map = new Map<string, number>();
    const today = getAppDate();
    uniqueCounters.forEach(c => {
      if (c.deleted_at) return;
      const markEvents = allEvents.filter(e => e.mark_id === c.id && !e.deleted_at && e.event_type === 'increment');
      if (markEvents.length === 0) { map.set(c.id, -1); return; }
      const lastDate = markEvents.reduce((latest, e) => e.occurred_local_date > latest ? e.occurred_local_date : latest, '');
      const diff = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
      map.set(c.id, diff);
    });
    return map;
  }, [uniqueCounters, allEvents, appDateKey]);

  // ── Mark colors for header segments ──────────────────────────────────
  const markColorsOrdered = useMemo(
    () => localCounters.filter(c => !c.deleted_at).map(c => c.color || themeColors.primary),
    [localCounters, themeColors.primary],
  );

  // ── Header + week arc state objects for HomeHeader ───────────────────
  const headerState: HeaderState = useMemo(() => {
    const lastLogDate = allEvents
      .filter(e => !e.deleted_at && e.event_type === 'increment')
      .reduce((latest, e) => e.occurred_local_date > latest ? e.occurred_local_date : latest, '');
    const daysSinceLastLog = lastLogDate
      ? Math.floor((getAppDate().getTime() - new Date(lastLogDate).getTime()) / 86400000)
      : -1;
    return {
      completedToday: completedMarksToday,
      totalMarks: activeMarkCount,
      streakDays: overallStreakDays,
      now: getAppDate(),
      daysSinceLastLog,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedMarksToday, activeMarkCount, overallStreakDays, allEvents, appDateKey]);

  const weekLoggedDays = useMemo(() => {
    const anchor = getAppDate();
    const dow = anchor.getDay();
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((dow + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      return formatDate(d);
    });
    const active = new Set(allEvents.filter(e => !e.deleted_at && e.event_type === 'increment' && dates.includes(e.occurred_local_date)).map(e => e.occurred_local_date));
    return active.size;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const weekArcState: WeekArcState = useMemo(() => {
    const now = getAppDate();
    const dow = now.getDay();
    const anchor = now;
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((dow + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return formatDate(d);
    });
    const todayIdx = (dow + 6) % 7;
    const active = new Set(allEvents.filter(e => !e.deleted_at && e.event_type === 'increment' && dates.includes(e.occurred_local_date)).map(e => e.occurred_local_date));
    const isPerfectWeekSoFar = dates.slice(0, todayIdx + 1).every(d => active.has(d));
    return { now, weekLoggedDays: active.size, isPerfectWeekSoFar };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const postLogState: PostLogState = useMemo(() => ({
    streakDays: overallStreakDays,
    isReturning: (headerState.daysSinceLastLog ?? 0) >= 3,
    isCompleting3of3: completedMarksToday >= activeMarkCount && activeMarkCount > 0,
    isNearMiss: false,
  }), [overallStreakDays, headerState.daysSinceLastLog, completedMarksToday, activeMarkCount]);

  const [momentumHighlight, setMomentumHighlight] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (completedMarksToday < activeMarkCount || activeMarkCount === 0) return;
      try {
        const key = '@livra_hint_first_all_done_momentum';
        const seen = await AsyncStorage.getItem(key);
        if (seen === '1' || cancelled) return;
        await AsyncStorage.setItem(key, '1');
        if (cancelled) return;
        setMomentumHighlight(true);
        timer = setTimeout(() => setMomentumHighlight(false), 2000);
      } catch {
        /* ignore */
      }
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [completedMarksToday, activeMarkCount]);

  const [multiHintDismissed, setMultiHintDismissed] = useState(false);
  const [multiHintLoaded, setMultiHintLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await AsyncStorage.getItem('@livra_hint_multi_target_dismissed');
        if (!cancelled) {
          setMultiHintDismissed(d === '1');
          setMultiHintLoaded(true);
        }
      } catch {
        if (!cancelled) setMultiHintLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMultiTargetMark = useMemo(
    () => uniqueCounters.some((c) => !c.deleted_at && resolveDailyTarget(c) > 1),
    [uniqueCounters],
  );

  // ── Momentum System ───────────────────────────────────────
  // momentum_score = number of days (out of the last 10, including today)
  // on which this counter had at least 1 increment.
  // Streak resets on a missed day, but momentum reflects longer consistency,
  // so a missed day doesn't feel like total failure.
  const momentumScores = useMemo(() => {
    // Build set of the 10 most recent date strings (today + 9 days back)
    const last10: Set<string> = new Set();
    const anchor = getAppDate();
    for (let i = 0; i < 10; i++) {
      last10.add(formatDate(subDays(anchor, i)));
    }

    // Group active dates per mark from increment events within the window
    const markDays = new Map<string, Set<string>>();
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      if (!last10.has(e.occurred_local_date)) return;
      if (!markDays.has(e.mark_id)) markDays.set(e.mark_id, new Set());
      markDays.get(e.mark_id)!.add(e.occurred_local_date);
    });

    // Map each active counter ID → its momentum score (0–10)
    const scores = new Map<string, number>();
    uniqueCounters.forEach(c => {
      if (!c.deleted_at) {
        scores.set(c.id, markDays.get(c.id)?.size ?? 0);
      }
    });
    return scores;
  }, [allEvents, uniqueCounters, appDateKey]);

  const hasPartialProgressToday = useMemo(
    () =>
      uniqueCounters.some((c) => {
        if (c.deleted_at) return false;
        const t = todayCountsMap.get(c.id) ?? 0;
        const g = resolveDailyTarget(c);
        return t > 0 && t < g;
      }),
    [uniqueCounters, todayCountsMap],
  );

  // ── Weekly completion per mark [Mon=0 … Sun=6] ──────────────────
  // true when the mark's daily goal was fully met on that weekday.
  // Today's slot is computed from events too (the row overrides it optimistically).
  const weekCompletionMap = useMemo(() => {
    const today = getAppDate();
    const mondayOffset = (today.getDay() + 6) % 7; // days back to Monday
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - mondayOffset + i);
      return formatDate(d);
    });

    // Sum increment amounts per mark per weekday
    const sumsByMark = new Map<string, number[]>();
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      const dayIdx = weekDates.indexOf(e.occurred_local_date);
      if (dayIdx === -1) return;
      if (!sumsByMark.has(e.mark_id)) sumsByMark.set(e.mark_id, [0, 0, 0, 0, 0, 0, 0]);
      sumsByMark.get(e.mark_id)![dayIdx] += e.amount ?? 1;
    });

    const map = new Map<string, boolean[]>();
    uniqueCounters.forEach(c => {
      if (c.deleted_at) return;
      const goal = resolveDailyTarget(c);
      const sums = sumsByMark.get(c.id) ?? [0, 0, 0, 0, 0, 0, 0];
      map.set(c.id, sums.map(sum => sum >= goal));
    });
    return map;
  }, [allEvents, uniqueCounters, resolveDailyTarget, appDateKey]);

  // ── Note indicator: marks that have a daily log note for today ───
  const dailyLogs = useDailyTrackingStore((s) => s.dailyLogs);
  const noteMarkIdsToday = useMemo(() => {
    const set = new Set<string>();
    dailyLogs.forEach((row) => {
      if (row.date === todayStr && row.text.trim()) set.add(row.mark_id);
    });
    return set;
  }, [dailyLogs, todayStr, appDateKey]);

  // ── Near-completion: marks 1–2 taps away from their goal ────────
  const nearCompletionMap = useMemo(() => {
    const map = new Map<string, number>();
    localCounters.forEach(mark => {
      const goal = resolveDailyTarget(mark);
      const today = todayCountsMap.get(mark.id) ?? 0;
      const remaining = goal - today;
      const compressed = getCompressedProgress(today, goal);
      const segmentRemaining = compressed.units - compressed.filled;
      if ((remaining >= 1 && remaining <= 2) || segmentRemaining <= 1) {
        map.set(mark.id, remaining);
      }
    });
    return map;
  }, [localCounters, todayCountsMap, resolveDailyTarget]);

  // ── Directional header message (marks left today, not taps) ──────────
  const directionalMessage = useMemo(() => {
    if (activeMarkCount === 0) return null;
    if (incompleteMarksToday === 0) return null;
    const nearCount = nearCompletionMap.size;
    if (nearCount > 0 && incompleteMarksToday <= 2) {
      return `${incompleteMarksToday} left · ${nearCount} almost there`;
    }
    if (incompleteMarksToday === 1) return '1 mark left today';
    return `${incompleteMarksToday} marks left today`;
  }, [activeMarkCount, incompleteMarksToday, nearCompletionMap]);

  // ── Priority sort for active rows ────────────────────────────────
  // 1) 1 segment left first
  // 2) started rows above untouched
  // 3) higher completion ratio first
  // 4) fallback to manual order
  const sortedActiveCounters = useMemo(() => {
    const indexed = localCounters.map((counter, index) => ({ counter, index }));
    const active = indexed.filter(({ counter }) => {
      const goal = resolveDailyTarget(counter);
      const done = (todayCountsMap.get(counter.id) ?? 0) >= goal;
      return !done;
    });

    active.sort((a, b) => {
      const aToday = todayCountsMap.get(a.counter.id) ?? 0;
      const bToday = todayCountsMap.get(b.counter.id) ?? 0;
      const aGoal = resolveDailyTarget(a.counter);
      const bGoal = resolveDailyTarget(b.counter);

      const aCompressed = getCompressedProgress(aToday, aGoal);
      const bCompressed = getCompressedProgress(bToday, bGoal);
      const aSegLeft = Math.max(0, aCompressed.units - aCompressed.filled);
      const bSegLeft = Math.max(0, bCompressed.units - bCompressed.filled);
      const aOneLeft = aSegLeft === 1;
      const bOneLeft = bSegLeft === 1;
      if (aOneLeft !== bOneLeft) return aOneLeft ? -1 : 1;

      const aStarted = aToday > 0;
      const bStarted = bToday > 0;
      if (aStarted !== bStarted) return aStarted ? -1 : 1;

      const aRatio = Math.min(1, aToday / aGoal);
      const bRatio = Math.min(1, bToday / bGoal);
      if (aRatio !== bRatio) return bRatio - aRatio;

      return a.index - b.index;
    });

    return active.map(({ counter }) => counter);
  }, [localCounters, todayCountsMap, resolveDailyTarget]);

  const activeMarkId = useMemo(
    () => sortedActiveCounters[0]?.id ?? null,
    [sortedActiveCounters],
  );

  // ── Completed counters (separated so header can access count even when collapsed) ──
  const completedCounters = useMemo(() => {
    return localCounters.filter(c => (todayCountsMap.get(c.id) ?? 0) >= resolveDailyTarget(c));
  }, [localCounters, todayCountsMap, resolveDailyTarget]);

  // ── Sections for the list: active first, done-today below ───────
  const listSections = useMemo(() => {
    const collapseCompleted = doneCollapsed && completedCounters.length >= 2;
    return [
      { key: 'active', data: sortedActiveCounters },
      ...(completedCounters.length > 0
        ? [{ key: 'done-today', data: collapseCompleted ? [] : completedCounters }]
        : []),
    ];
  }, [completedCounters, sortedActiveCounters, doneCollapsed]);

  const handleCreateCounter = () => {
    router.push('/counter/new');
  };

  const handleCounterPress = useCallback((id: string) => {
    router.push(`/counter/${id}`);
  }, [router]);

  const handleQuickIncrement = useCallback(async (counterId: string) => {
    if (!user?.id) {
      logger.error('[Home] Cannot increment counter - user not authenticated');
      return;
    }
    // incrementCounter may throw (e.g. validation); gating is not enforced in 2.0
    try {
      const counter = counters.find(c => c.id === counterId);
      if (counter) {
        const target = resolveDailyTarget(counter);
        const currentToday = todayCountsMap.get(counterId) ?? 0;
        if (currentToday >= target) return;
      }
      await incrementCounter(counterId, user.id, 1);
      // Update notifications after incrementing (in case streak status changed)
      // Don't await - let it happen in background
      if (permissionGranted) {
        updateSmartNotifications(user?.id).catch((error) => {
          logger.error('Error updating notifications after increment:', error);
        });
      }
    } catch (error: unknown) {
      logger.error('Error incrementing counter:', error);
      throw error;
    }
  }, [user?.id, incrementCounter, permissionGranted, updateSmartNotifications, counters, todayCountsMap, resolveDailyTarget]);

  const persistReorderedCounters = useCallback(
    async (orderedCounters: Counter[]) => {
      // Optimistically update local state for smooth feedback
      setLocalCounters(orderedCounters);

      const now = new Date().toISOString();
      const updates = orderedCounters.map((counter, index) => ({
        id: counter.id,
        sort_index: index,
      }));

      try {
        await Promise.all(
          updates.map((update) =>
            execute('UPDATE lc_counters SET sort_index = ?, updated_at = ? WHERE id = ?', [
              update.sort_index,
              now,
              update.id,
            ])
          )
        );

        useCountersStore.setState(() => ({
          counters: orderedCounters.map((counter, index) => ({
            ...counter,
            sort_index: index,
            updated_at: now,
          })),
        }));

        if (user) {
          sync().catch((error: any) => {
            logger.error('Error syncing after counter reorder:', error);
          });
        }
      } catch (error) {
        logger.error('Error updating sort order:', error);
        setLocalCounters(counters);
        Alert.alert('Error', 'Failed to save new order. Please try again.');
      }
    },
    [counters, sync, user]
  );

  // Handle delete with confirmation for marks that have a value
  const handleDeleteCounter = useCallback(
    (counter: Counter) => {
      if (counter.total > 0) {
        // Show confirmation dialog for marks with values
        Alert.alert(
          'Delete Mark?',
          `"${counter.name}" has ${counter.total} ${counter.unit || 'items'}. Are you sure you want to delete it? This action cannot be undone.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                deleteCounter(counter.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            },
          ],
          { cancelable: true }
        );
      } else {
        // Delete immediately if no value
        deleteCounter(counter.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [deleteCounter]
  );

  // ── List-mode render callbacks ──────────────────────────────────
  const renderHabitRow = useCallback(
    ({ item, section }: { item: Counter; section: { key: string } }) => {
      const isCompleted = section.key === 'done-today';
      const goalMet = (todayCountsMap.get(item.id) ?? 0) >= resolveDailyTarget(item);
      const willCompleteAll =
        !goalMet &&
        ((todayCountsMap.get(item.id) ?? 0) + 1 >= resolveDailyTarget(item)) &&
        completedMarksToday + 1 >= activeMarkCount;

      return (
        <HabitRowCounter
          counter={item}
          streak={
            streakDerivedByMark.get(item.id)
              ? {
                  current: streakDerivedByMark.get(item.id)!.current,
                  longest: streakDerivedByMark.get(item.id)!.longest,
                }
              : undefined
          }
          momentumScore={momentumScores.get(item.id)}
          todayCount={todayCountsMap.get(item.id) ?? 0}
          isCompleted={goalMet}
          isCompact={isCompleted}
          isActive={!isCompleted && item.id === activeMarkId}
          nearCompletion={nearCompletionMap.get(item.id) ?? null}
          hasNote={noteMarkIdsToday.has(item.id)}
          daysSinceLastLog={daysSinceLastLogByMark.get(item.id) ?? 0}
          weekCompletedDays={weekCompletionMap.get(item.id)}
          onPress={() => handleCounterPress(item.id)}
          onIncrement={() => handleQuickIncrement(item.id)}
          onAllComplete={willCompleteAll ? () => setCeremonyToken(t => t + 1) : undefined}
          iconType={resolveCounterIconType(item)}
        />
      );
    },
    [
      streakDerivedByMark, momentumScores, todayCountsMap,
      activeMarkId, nearCompletionMap, weekCompletionMap, noteMarkIdsToday,
      handleCounterPress, handleQuickIncrement, resolveDailyTarget,
    ],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { key: string; data: Counter[] } }) => {
      if (section.key !== 'done-today') return null;
      const canCollapse = completedCounters.length >= 2;
      return (
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={canCollapse ? () => setDoneCollapsed(v => !v) : undefined}
          activeOpacity={canCollapse ? 0.6 : 1}
        >
          <Text style={[styles.sectionHeaderText, { color: themeColors.textTertiary }]}>
            DONE TODAY · {completedCounters.length}
          </Text>
          {canCollapse && (
            <Ionicons
              name={doneCollapsed ? 'chevron-down' : 'chevron-up'}
              size={12}
              color={themeColors.textTertiary}
              style={{ marginLeft: 4 }}
            />
          )}
        </TouchableOpacity>
      );
    },
    [themeColors.textTertiary, completedCounters.length, doneCollapsed],
  );

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <GradientBackground>
      <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
        {/* ── Top bar ──────────────────────────────────────────── */}
        <View style={styles.topBar}>
          {/* Logo left */}
          <Logo size={28} />

          {/* Edit / Done toggle (center) */}
          <TouchableOpacity
            style={styles.editIconBtn}
            onPress={() => setIsEditMode(!isEditMode)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isEditMode ? 'checkmark-circle-outline' : 'apps-outline'}
              size={20}
              color={isEditMode ? '#FEB729' : themeColors.textSecondary}
            />
          </TouchableOpacity>

          {/* Avatar right */}
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push('/(tabs)/settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.profileIcon, { backgroundColor: themeColors.surface }]}>
              {profileImageUri ? (
                <Image
                  source={{ uri: profileImageUri }}
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="person-circle-outline" size={22} color={themeColors.textSecondary} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Living header + progress segments — hidden in edit mode ── */}
        {!isEditMode && activeMarkCount > 0 && (
          <>
            <HomeHeader
              headerState={headerState}
              weekArcState={weekArcState}
              postLogState={postLogState}
              markColors={markColorsOrdered}
              totalMarks={activeMarkCount}
              completedToday={completedMarksToday}
              ceremonyToken={ceremonyToken}
            />
            <WeeklySummaryStrip
              onPress={() => router.navigate('/(tabs)/tracking' as any)}
              incompleteMarksToday={incompleteMarksToday}
              hasPartialProgressToday={hasPartialProgressToday}
            />
          </>
        )}

        {/* ── Active goal banner — always visible (not gated on marks) ── */}
        {!isEditMode && <ActiveGoalBanner />}
        {!isEditMode && (
          <PaceBanner
            isBehind={paceAlert.isBehind}
            projectedMiss={paceAlert.projectedMiss}
            goalTitle={paceAlert.goalTitle}
            goalId={paceAlert.goalId}
            suggestedDate={paceAlert.suggestedDate}
          />
        )}
        {!isEditMode && <CheckinButton />}

        {/* ── Edit mode hint ────────────────────────────────────── */}
        {isEditMode && (
          <View style={styles.editHintBar}>
            <Ionicons name="reorder-two-outline" size={14} color={themeColors.textSecondary} />
            <AppText style={[styles.editHintText, { color: themeColors.textSecondary }]}>
              Hold &amp; drag to reorder
            </AppText>
          </View>
        )}

        {localCounters.length === 0 ? (
          <EmptyState
            title={loading ? "Loading marks" : "Add your first mark."}
            message={loading ? "Please wait..." : "Marks are the daily actions that move your goal forward. Pick something you've been putting off and start there."}
            iconElement={
              loading ? (
                <ActivityIndicator size="large" color={themeColors.textSecondary} />
              ) : (
                <Ionicons name="sparkles-outline" size={52} color={themeColors.textTertiary} />
              )
            }
            actionLabel={loading ? undefined : "Create Mark"}
            onAction={loading ? undefined : handleCreateCounter}
          />
        ) : isEditMode ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[styles.gridContainer, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <SortableMarkList
              marks={localCounters.filter((c) => !c.deleted_at)}
              onReorder={persistReorderedCounters}
              onDelete={handleDeleteCounter}
              showDelete={!!user}
              theme={theme}
              scrollViewRef={scrollViewRef}
            />
          </ScrollView>
        ) : (
          <SectionList
            sections={listSections}
            keyExtractor={(item) => item.id}
            renderItem={renderHabitRow}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            extraData={localCounters}
            ListFooterComponent={
              <TouchableOpacity
                style={styles.statsFooter}
                onPress={() => router.push('/(tabs)/stats' as any)}
                activeOpacity={0.6}
              >
                <Text style={[styles.statsFooterText, { color: themeColors.textTertiary }]}>
                  Your history →
                </Text>
              </TouchableOpacity>
            }
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  appTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: 2.5,
  },
  editIconBtn: {
    padding: spacing.xs,
    width: 36,
    alignItems: 'flex-start',
  },
  editHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  editHintText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  // ── Legacy header refs (onboarding is index-gated; no home hint) ──
  brandLogo: {
    width: 94,
    height: 94,
  },
  profileButton: {
    padding: spacing.xs,
  },
  profileIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
    overflow: 'hidden',
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
  },
  inlineHint: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inlineHintText: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    fontWeight: fontWeight.medium,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing['4xl'],
  },
  statsFooter: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statsFooterText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
  },
  scrollView: {
    flex: 1,
  },
  gridContainer: {
    width: '100%',
    paddingHorizontal: GRID_OUTER_PADDING - GRID_COLUMN_GAP / 2,
    paddingBottom: spacing['4xl'],
    alignItems: 'center',
    flexGrow: 1,
  },
  row: {
    width: GRID_BLOCK_WIDTH * 2,
    justifyContent: 'flex-start',
  },
  gridItemWrapper: {
    width: GRID_BLOCK_WIDTH,
    height: GRID_ITEM_HEIGHT + GRID_ROW_GAP,
    justifyContent: 'flex-start',
    paddingHorizontal: GRID_COLUMN_GAP / 2,
    paddingBottom: GRID_ROW_GAP,
  },
  gridItemInner: {
    flex: 1,
    height: GRID_ITEM_HEIGHT,
  },
});

