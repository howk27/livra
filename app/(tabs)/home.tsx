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
import { DraggableGrid, IDraggableGridProps } from 'react-native-draggable-grid';
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
import MarkIcon from '@/src/components/icons/CounterIcon';
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
import { DailyProgressCard } from '../../components/DailyProgressCard';
import { WeeklySummaryStrip } from '../../components/WeeklySummaryStrip';
import { deriveStreakForMark } from '../../hooks/useStreaks';

const APP_BRAND_LOGO_LIGHT = require('../../assets/branding/Logo NoBG.png');
const APP_BRAND_LOGO_DARK = require('../../assets/branding/Logo NoBG dark.png');

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_OUTER_PADDING = spacing.md;
const GRID_COLUMN_GAP = spacing.sm;
const GRID_ROW_GAP = spacing.sm;
const GRID_ITEM_HEIGHT = 178;
const GRID_AVAILABLE_WIDTH = SCREEN_WIDTH - GRID_OUTER_PADDING * 2;
const GRID_BLOCK_WIDTH = GRID_AVAILABLE_WIDTH / 2;
const EDIT_ROW_HEIGHT = 58;
const EDIT_ROW_GAP = spacing.xs;
/** Edit-mode list only: mark title + symbol icon scale vs normal grid tiles */
const EDIT_MODE_MARK_TITLE_ICON_SCALE = 1.2;
const EDIT_MODE_MARK_ICON_SIZE = Math.round(16 * EDIT_MODE_MARK_TITLE_ICON_SCALE);
const EDIT_MODE_MARK_ICON_WRAP = Math.round(22 * EDIT_MODE_MARK_TITLE_ICON_SCALE);

export default function HomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();

  const { counters, loading, incrementCounter, deleteCounter } = useCounters();
  const { sync } = useSync();
  const { updateSmartNotifications, permissionGranted } = useNotifications();
  const [localCounters, setLocalCounters] = useState<Counter[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const { isEditMode, setIsEditMode } = useFABContext();
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollViewYRef = useRef<number>(0);

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

  // Reset grid data when entering edit mode to ensure DraggableGrid initializes properly
  useEffect(() => {
    if (isEditMode) {
      // Force a small delay to ensure the grid re-renders with fresh data
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

  // Initialize and update smart notifications
  useEffect(() => {
    const setupNotifications = async () => {
      if (!permissionGranted || counters.length === 0) return;

      // Update notifications when counters change
      await updateSmartNotifications(user?.id);
    };

    // Initial setup
    setupNotifications();

    // Also update when counters change (after a delay to avoid too frequent updates)
    const timeoutId = setTimeout(() => {
      setupNotifications();
    }, 2000); // Wait 2 seconds after counters change

    return () => clearTimeout(timeoutId);
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

  type GridCounter = Counter & { key: string };

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

  const gridData: GridCounter[] = useMemo(() => {
    // Ensure unique keys by deduplicating counters
    const seen = new Set<string>();
    return localCounters
      .filter((counter) => {
        if (seen.has(counter.id)) {
          logger.warn(`[HomeScreen] Duplicate counter ID detected: ${counter.id}, skipping`);
          return false;
        }
        seen.add(counter.id);
        return true;
      })
      .map((counter) => ({
        ...counter,
        key: counter.id,
      }));
  }, [localCounters]);

  const renderGridItem: IDraggableGridProps<GridCounter>['renderItem'] = useCallback(
    (item) => {
      const isDark = theme === 'dark';
      const themeC = colors[theme];
      const markColor = item.color || themeC.primary;
      const rowBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';
      const borderC = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
      const iconType = resolveCounterIconType(item);

      return (
        <View style={styles.editItemWrapper}>
          <View
            style={[
              styles.editItemInner,
              { backgroundColor: rowBg, borderColor: borderC },
            ]}
          >
            {/* Drag handle */}
            <Ionicons
              name="reorder-two-outline"
              size={20}
              color={themeC.textSecondary}
              style={styles.dragHandle}
            />

            {/* Identity: icon + name */}
            <View style={styles.editIdentity}>
              <View
                style={[
                  styles.editIconWrap,
                  {
                    width: EDIT_MODE_MARK_ICON_WRAP,
                    height: EDIT_MODE_MARK_ICON_WRAP,
                    backgroundColor: applyOpacity(markColor, 0.15),
                  },
                ]}
              >
                <MarkIcon
                  type={iconType ?? 'focus'}
                  size={EDIT_MODE_MARK_ICON_SIZE}
                  variant="symbol"
                  animate="none"
                  ariaLabel={`${item.name} icon`}
                  color={markColor}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.editRowName,
                  {
                    color: themeC.text,
                    fontSize: fontSize.sm * EDIT_MODE_MARK_TITLE_ICON_SCALE,
                  },
                ]}
              >
                {item.name}
              </Text>
            </View>

            {/* Spacer — keeps delete button right-aligned without progress clutter */}
            <View style={{ flex: 1 }} />

            {/* Delete */}
            {user && (
              <TouchableOpacity
                onPress={() => handleDeleteCounter(item)}
                style={styles.deleteBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={16} color={themeC.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [theme, user, handleDeleteCounter],
  );

  // Auto-scroll during drag
  const scrollOffsetRef = useRef(0);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartTimeRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchYPositionRef = useRef<number | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  const scrollStartDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track scroll position
  const handleScroll = useCallback((event: any) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  // Auto-scroll logic when dragging - improved proximity-based scrolling with easing
  const startAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
    }

    const SCROLL_INTERVAL = 16; // ~60fps for smoother scrolling
    const EDGE_THRESHOLD = 80; // Reduced threshold - only scroll when very close to edge (pixels)
    const MAX_SCROLL_SPEED = 4; // Reduced max speed for better control (pixels per interval)
    const MIN_SCROLL_SPEED = 0.5; // Slower minimum speed for fine control
    const EASING_POWER = 2.5; // Easing curve power (higher = more gradual acceleration)

    autoScrollIntervalRef.current = setInterval(() => {
      if (!isDraggingRef.current || !scrollViewRef.current || touchYPositionRef.current === null) {
        return;
      }

      // Check if user is actively moving (not just holding still)
      // If they're moving significantly, reduce scroll speed to give them more control
      const isActivelyMoving = lastTouchYRef.current !== null && 
                               touchYPositionRef.current !== null &&
                               Math.abs(touchYPositionRef.current - lastTouchYRef.current) > 3;

      // Get scroll metrics
      const scrollMetrics = (scrollViewRef.current as any)._scrollMetrics;
      if (!scrollMetrics) return;

      const currentOffset = scrollOffsetRef.current;
      const contentHeight = scrollMetrics.contentLength || 0;
      const viewportHeight = scrollMetrics.visibleLength || Dimensions.get('window').height;
      const maxScroll = Math.max(0, contentHeight - viewportHeight);
      const touchY = touchYPositionRef.current;
      
      // touchY is already relative to the ScrollView viewport (either locationY or pageY - offset)
      // Calculate distance from top and bottom edges of the ScrollView viewport
      const distanceFromTop = Math.max(0, touchY);
      const distanceFromBottom = Math.max(0, viewportHeight - touchY);
      
      // Determine scroll direction and speed based on proximity to edges with easing
      let scrollDelta = 0;
      
      // Scroll down if finger is near bottom edge
      if (distanceFromBottom < EDGE_THRESHOLD && currentOffset < maxScroll) {
        const proximity = Math.max(0, EDGE_THRESHOLD - distanceFromBottom);
        // Use easing function for smoother acceleration (ease-in-out curve)
        const normalizedProximity = proximity / EDGE_THRESHOLD; // 0 to 1
        const easedFactor = Math.pow(normalizedProximity, EASING_POWER); // Apply easing
        let speed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * easedFactor;
        // Reduce speed if user is actively moving to give them more control
        if (isActivelyMoving) {
          speed *= 0.5; // Cut speed in half when actively dragging
        }
        scrollDelta = speed;
      }
      // Scroll up if finger is near top edge
      else if (distanceFromTop < EDGE_THRESHOLD && currentOffset > 0) {
        const proximity = Math.max(0, EDGE_THRESHOLD - distanceFromTop);
        // Use easing function for smoother acceleration (ease-in-out curve)
        const normalizedProximity = proximity / EDGE_THRESHOLD; // 0 to 1
        const easedFactor = Math.pow(normalizedProximity, EASING_POWER); // Apply easing
        let speed = MIN_SCROLL_SPEED + (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED) * easedFactor;
        // Reduce speed if user is actively moving to give them more control
        if (isActivelyMoving) {
          speed *= 0.5; // Cut speed in half when actively dragging
        }
        scrollDelta = -speed;
      }
      
      // Apply scroll if there's a delta (only if significant enough to avoid jitter)
      if (Math.abs(scrollDelta) > 0.1) {
        const newOffset = Math.max(0, Math.min(maxScroll, currentOffset + scrollDelta));
        scrollOffsetRef.current = newOffset;
        scrollViewRef.current.scrollTo({
          y: newOffset,
          animated: false,
        });
      }
    }, SCROLL_INTERVAL);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    if (scrollStartDelayRef.current) {
      clearTimeout(scrollStartDelayRef.current);
      scrollStartDelayRef.current = null;
    }
    isDraggingRef.current = false;
    dragStartTimeRef.current = null;
    touchStartTimeRef.current = null;
    touchYPositionRef.current = null;
    lastTouchYRef.current = null;
    // Re-enable ScrollView scrolling when drag ends
    setScrollEnabled(true);
  }, []);

  // Reset scroll state when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      setScrollEnabled(true);
      stopAutoScroll();
    }
  }, [isEditMode, stopAutoScroll]);

  const handleGridDragRelease = useCallback(
    async (newData: GridCounter[]) => {
      stopAutoScroll();
      
      const orderedCounters = newData.map(({ key: _key, ...rest }) => rest as Counter);

      const hasChanged =
        orderedCounters.length !== localCounters.length ||
        orderedCounters.some((counter, index) => counter.id !== localCounters[index]?.id);

      if (!hasChanged) {
        return;
      }

      await persistReorderedCounters(orderedCounters);
    },
    [localCounters, persistReorderedCounters, stopAutoScroll]
  );

  // Cleanup on unmount or when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      stopAutoScroll();
    }
    return () => {
      stopAutoScroll();
    };
  }, [isEditMode, stopAutoScroll]);

  // ── List-mode render callbacks ──────────────────────────────────
  const renderHabitRow = useCallback(
    ({ item, section }: { item: Counter; section: { key: string } }) => {
      const isCompleted = section.key === 'done-today';
      const goalMet = (todayCountsMap.get(item.id) ?? 0) >= resolveDailyTarget(item);
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
          weekCompletedDays={weekCompletionMap.get(item.id)}
          onPress={() => handleCounterPress(item.id)}
          onIncrement={() => handleQuickIncrement(item.id)}
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
          {/* Edit / Done toggle */}
          <TouchableOpacity
            style={styles.editIconBtn}
            onPress={() => setIsEditMode(!isEditMode)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isEditMode ? 'checkmark-circle-outline' : 'apps-outline'}
              size={22}
              color={isEditMode ? themeColors.primary : themeColors.textSecondary}
            />
          </TouchableOpacity>

          {/* App name (centered) */}
          <Text style={[styles.appTitle, { color: themeColors.text }]}>LIVRA</Text>

          {/* Avatar */}
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

        {/* ── Inline progress (flat, no card) — hidden in edit mode ── */}
        {!isEditMode && activeMarkCount > 0 && (
          <>
            <DailyProgressCard
              completedToday={completedMarksToday}
              totalMarks={activeMarkCount}
              directionalMessage={directionalMessage}
              streakDays={overallStreakDays}
              streakPulseToken={streakPulseToken}
              allMarksComplete={completedMarksToday >= activeMarkCount}
              momentumHighlight={momentumHighlight}
              flat
            />
            <WeeklySummaryStrip
              onPress={() => router.navigate('/(tabs)/tracking')}
              incompleteMarksToday={incompleteMarksToday}
              hasPartialProgressToday={hasPartialProgressToday}
            />
            {multiHintLoaded && hasMultiTargetMark && !multiHintDismissed && (
              <TouchableOpacity
                style={[styles.inlineHint, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceVariant }]}
                activeOpacity={0.85}
                onPress={async () => {
                  setMultiHintDismissed(true);
                  try {
                    await AsyncStorage.setItem('@livra_hint_multi_target_dismissed', '1');
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <AppText style={[styles.inlineHintText, { color: themeColors.textSecondary }]}>
                  Multi-tap marks fill segments until the daily target is met. Tap to dismiss.
                </AppText>
              </TouchableOpacity>
            )}
          </>
        )}

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
            title={loading ? "Loading marks" : "Start Your Journey"}
            message={loading ? "Please wait while we load your marks..." : "Create your first mark to start tracking your progress and building momentum!"}
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
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            scrollEnabled={scrollEnabled}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            onLayout={() => {
              // Measure ScrollView's position on screen for touch position calculation
              if (scrollViewRef.current) {
                (scrollViewRef.current as any).measureInWindow((x: number, y: number) => {
                  scrollViewYRef.current = y;
                });
              }
            }}
            onTouchStart={(event) => {
              // Track when touch starts
              if (isEditMode) {
                touchStartTimeRef.current = Date.now();
                isDraggingRef.current = false;
                const touch = event.nativeEvent.touches[0];
                if (touch) {
                  // Prefer locationY (relative to ScrollView), fallback to pageY (absolute, needs offset)
                  const locationY = (touch as any).locationY;
                  touchYPositionRef.current = locationY !== undefined ? locationY : touch.pageY - scrollViewYRef.current;
                }
              }
            }}
            onTouchMove={(event) => {
              // Update touch position for proximity-based scrolling
              if (isEditMode) {
                const touch = event.nativeEvent.touches[0];
                if (touch) {
                  // Prefer locationY (relative to ScrollView), fallback to pageY (absolute, needs offset)
                  const locationY = (touch as any).locationY;
                  touchYPositionRef.current = locationY !== undefined ? locationY : touch.pageY - scrollViewYRef.current;
                }
                
                // Detect drag: if touch moves after long press delay, it's likely a drag
                if (!isDraggingRef.current && touchStartTimeRef.current) {
                  const touchDuration = Date.now() - touchStartTimeRef.current;
                  // DraggableGrid uses 180ms delayLongPress, so after 250ms if still moving, it's a drag
                  // Added extra delay to ensure drag is intentional
                  if (touchDuration > 250) {
                    isDraggingRef.current = true;
                    dragStartTimeRef.current = Date.now();
                    lastTouchYRef.current = touchYPositionRef.current;
                    
                    // Disable ScrollView scrolling when dragging starts to prevent conflicts
                    setScrollEnabled(false);
                    
                    // Add a small delay before starting auto-scroll to avoid immediate scrolling
                    // This gives user time to position the card before auto-scroll kicks in
                    if (scrollStartDelayRef.current) {
                      clearTimeout(scrollStartDelayRef.current);
                    }
                    scrollStartDelayRef.current = setTimeout(() => {
                      startAutoScroll();
                    }, 300); // 300ms delay before auto-scroll starts
                  }
                }
                
                // Track touch movement to detect if user is actively dragging (not just holding)
                if (isDraggingRef.current && lastTouchYRef.current !== null && touchYPositionRef.current !== null) {
                  const movement = Math.abs(touchYPositionRef.current - lastTouchYRef.current);
                  // If user is moving finger significantly, they're actively dragging
                  // Only update last position if movement is significant to avoid jitter
                  if (movement > 5) {
                    lastTouchYRef.current = touchYPositionRef.current;
                  }
                }
              }
            }}
            onTouchEnd={() => {
              stopAutoScroll();
            }}
            onTouchCancel={() => {
              stopAutoScroll();
            }}
          >
            <DraggableGrid
              key={`draggable-grid-${isEditMode}-${localCounters.length}`}
              data={gridData}
              numColumns={1}
              renderItem={renderGridItem}
              onDragRelease={handleGridDragRelease}
              delayLongPress={180}
              itemHeight={EDIT_ROW_HEIGHT + EDIT_ROW_GAP}
              style={styles.draggableGrid}
              dragStartAnimation={styles.dragStartAnimation}
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
  // ── Edit-mode list row ─────────────────────────────────────────
  editItemWrapper: {
    width: GRID_AVAILABLE_WIDTH,
    height: EDIT_ROW_HEIGHT + EDIT_ROW_GAP,
    paddingBottom: EDIT_ROW_GAP,
  },
  editItemInner: {
    height: EDIT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dragHandle: {
    paddingRight: spacing.xxs,
  },
  editIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    minWidth: 120,
  },
  editIconWrap: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRowName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  deleteBtn: {
    padding: spacing.xs,
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
  draggableGrid: {
    width: GRID_AVAILABLE_WIDTH,
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
  dragStartAnimation: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
});

