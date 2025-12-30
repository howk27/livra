import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { ChartMini } from '../../components/ChartMini';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { getLast7Days } from '../../lib/date';
import { query } from '../../lib/db';
import { CounterStreak } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../lib/utils/logger';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';

// Counter Progress Ring constants
const COUNTER_RING_RADIUS = 85;
const COUNTER_RING_STROKE = 10;
const COUNTER_RING_SIZE = COUNTER_RING_RADIUS * 2 + COUNTER_RING_STROKE;
const COUNTER_RING_CIRCUMFERENCE = 2 * Math.PI * COUNTER_RING_RADIUS;
const COUNTER_MAX_QUANTITY = 90;

export default function CounterDetailScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, loading, getCounter, incrementCounter, decrementCounter, resetCounter, deleteCounter } =
    useCounters();
  // CRITICAL: Use selector to ensure reactivity - subscribe to events array changes
  const allEvents = useEventsStore((state) => state.events || []);
  const getEventsByMark = useEventsStore((state) => state.getEventsByMark);
  const loadEvents = useEventsStore((state) => state.loadEvents);
  const { user } = useAuth();

  // Subscribe to counters array to ensure re-renders when store updates
  // Find counter from the reactive counters array instead of using getCounter
  const counter = id ? counters.find((c) => c.id === id) : null;
  // Get events reactively - filter from allEvents to ensure reactivity to store updates
  // CRITICAL: Use a more reliable dependency - the length and first event ID
  // This ensures we catch ALL changes, not just the first 20 events
  const eventsKey = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return 'no-events';
    // Use length + first event ID + last event ID to catch all changes
    const firstId = allEvents[0]?.id || '';
    const lastId = allEvents[allEvents.length - 1]?.id || '';
    return `${allEvents.length}-${firstId}-${lastId}`;
  }, [allEvents]);
  
  const events = useMemo(() => {
    if (!id) return [];
    const filtered = (allEvents || []).filter((e) => e.mark_id === id && !e.deleted_at);
    logger.log('[CounterDetail] Events filtered for mark:', {
      markId: id,
      allEventsCount: allEvents.length,
      filteredCount: filtered.length,
      eventTypes: filtered.slice(0, 5).map(e => `${e.event_type}:${e.amount}`),
      eventsKey,
    });
    return filtered;
  }, [id, allEvents, eventsKey]); // Include eventsKey to force recalculation
  const [streak, setStreak] = useState<CounterStreak | null>(null);
  const [progressAnim] = useState(new Animated.Value(0));
  const [maxValue, setMaxValue] = useState(100);
  
  // Animation for large value display bump
  const valueBumpAnim = useRef(new Animated.Value(1)).current;
  const [showActionSheet, setShowActionSheet] = useState(false);
  
  // Animation for ring progress
  const ringProgressAnim = useRef(new Animated.Value(0)).current;
  const [ringProgress, setRingProgress] = useState(0);
  
  // Track if we've attempted to load events for this mark to avoid repeated loads
  const hasLoadedEventsRef = useRef<string | null>(null);

  // Reset loading ref when ID changes
  useEffect(() => {
    hasLoadedEventsRef.current = null;
  }, [id]);

  // Initialize max value and progress when counter loads
  useEffect(() => {
    if (counter) {
      // Set max to be at least 10, or 20% more than current total (whichever is higher, but at least 10)
      const newMax = Math.max(Math.max(counter.total, 10) * 1.2, 10);
      setMaxValue(newMax);
      const progress = counter.total > 0 ? Math.min(counter.total / newMax, 1) : 0;
      progressAnim.setValue(progress);
    }
  }, [counter?.id]); // Only run when counter ID changes (initial load)

  // Update max value when counter total exceeds it
  useEffect(() => {
    if (counter && counter.total > maxValue) {
      setMaxValue(Math.max(counter.total * 1.2, 10));
    }
  }, [counter?.total, maxValue]);

  // Animate progress bar when counter changes
  useEffect(() => {
    if (counter) {
      const currentMax = maxValue || 10;
      const progress = counter.total > 0 ? Math.min(counter.total / currentMax, 1) : 0;
      Animated.spring(progressAnim, {
        toValue: progress,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }).start();
    }
  }, [counter?.total, maxValue]);

  // Animate value bump on change (scale 1.1 → 1.0, 180ms per spec)
  useEffect(() => {
    if (counter && counter.total > 0) {
      Animated.sequence([
        Animated.timing(valueBumpAnim, {
          toValue: 1.1,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(valueBumpAnim, {
          toValue: 1.0,
          duration: 90,
          useNativeDriver: true,
          easing: (t) => t * (2 - t), // cubic-bezier easing
        }),
      ]).start();
    }
  }, [counter?.total]);

  // Animate ring progress when screen opens OR when counter total changes
  // CRITICAL: Use a ref to track previous total to avoid unnecessary animations
  const prevTotalRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (counter) {
      const progress = Math.min(counter.total / COUNTER_MAX_QUANTITY, 1);
      const prevTotal = prevTotalRef.current;
      const isTotalChanged = prevTotal !== null && prevTotal !== counter.total;
      
      logger.log('[CounterDetail] Updating ring progress:', {
        markId: counter.id,
        total: counter.total,
        prevTotal,
        progress,
        isTotalChanged,
      });
      
      // Update ref
      prevTotalRef.current = counter.total;
      
      // Don't reset to 0 if we're just updating (not initial load)
      // Only reset on initial load (when ID changes)
      // Use ringProgress state instead of accessing private _value property
      const isInitialLoad = ringProgress === 0 && progress > 0;
      if (isInitialLoad) {
        ringProgressAnim.setValue(0);
        setRingProgress(0);
      }
      
      const listener = ringProgressAnim.addListener(({ value }) => {
        setRingProgress(value);
      });
      
      Animated.spring(ringProgressAnim, {
        toValue: progress,
        useNativeDriver: false, // strokeDashoffset doesn't support native driver
        tension: 50,
        friction: 7,
      }).start();
      
      return () => {
        ringProgressAnim.removeListener(listener);
      };
    } else {
      // Reset ref when counter is null
      prevTotalRef.current = null;
    }
  }, [counter?.id, counter?.total]); // Animate when counter ID changes (screen opens) OR total changes (increment/decrement)

  // Only load events once when screen comes into focus
  // Use ref to track loading state to prevent infinite loops
  useFocusEffect(
    React.useCallback(() => {
      if (id && hasLoadedEventsRef.current !== id) {
        // Check if we already have events for this mark in the store using the selector
        const existingEventsForMark = getEventsByMark(id);
        
        // Only load if we have no events for this mark in the store
        // If events exist, rely on reactive store updates (optimistic updates from addEvent)
        if (existingEventsForMark.length === 0) {
          hasLoadedEventsRef.current = id;
          
          if (user?.id) {
            // Load all user events (not just this mark's) to avoid replacing the store
            // Small delay to ensure any database writes from other screens have completed
            const timeoutId = setTimeout(() => {
              loadEvents(undefined, user.id).catch((error) => {
                logger.error('Error loading events for counter detail:', error);
                hasLoadedEventsRef.current = null; // Reset on error to allow retry
              });
            }, 300);
            
            return () => {
              clearTimeout(timeoutId);
            };
          } else {
            // Load events even without user ID (for offline mode)
            loadEvents().catch((error) => {
              logger.error('Error loading events for counter detail:', error);
              hasLoadedEventsRef.current = null; // Reset on error to allow retry
            });
          }
        } else {
          // Mark as loaded since events already exist
          hasLoadedEventsRef.current = id;
        }
      }
      
      // Reset ref when screen loses focus (navigating away)
      return () => {
        if (hasLoadedEventsRef.current === id) {
          hasLoadedEventsRef.current = null;
        }
      };
    }, [id, user?.id, loadEvents, getEventsByMark])
  );

  useEffect(() => {
    if (id) {
      // Load streak data
      query<CounterStreak>('SELECT * FROM lc_streaks WHERE counter_id = ? AND deleted_at IS NULL', [
        id,
      ]).then((result) => {
        if (result.length > 0) {
          setStreak(result[0]);
        }
      });
    }
  }, [id, allEvents]);

  // CRITICAL: All hooks must be called BEFORE any early returns
  // Prepare chart data
  // CRITICAL: Include both increment and decrement events to show net daily value
  // Use useMemo to ensure recalculation when events change
  const last7Days = useMemo(() => getLast7Days(), []); // Stable - only calculate once per render cycle
  const chartData = useMemo(() => {
    logger.log('[CounterDetail] Recalculating chart data:', {
      markId: id,
      eventsCount: events.length,
      eventTypes: events.slice(0, 10).map(e => `${e.event_type}:${e.amount}`).join(', '),
    });
    
    const eventsByDate = new Map<string, number>();
    
    events.forEach((event) => {
      if (event.event_type === 'increment' || event.event_type === 'decrement') {
        const current = eventsByDate.get(event.occurred_local_date) || 0;
        // Increments add, decrements subtract
        const change = event.event_type === 'increment' 
          ? event.amount 
          : -event.amount;
        eventsByDate.set(event.occurred_local_date, current + change);
      }
    });

    const result = last7Days.map((date) => ({
      date,
      value: Math.max(0, eventsByDate.get(date) || 0), // Ensure non-negative for display
    }));
    
    logger.log('[CounterDetail] Chart data calculated:', {
      markId: id,
      chartValues: result.map(d => `${d.date}:${d.value}`).join(', '),
    });
    
    return result;
  }, [events, last7Days, id]); // Recalculate when events change

  // CRITICAL: Early returns MUST come AFTER all hooks
  if (loading) {
    return <LoadingScreen />;
  }

  if (!counter || !id) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <Text style={[styles.errorText, { color: themeColors.text }]}>Counter not found</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const handleIncrement = async (amount: number = 1) => {
    if (!id || !counter) {
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!user?.id) {
      logger.error('[Counter] Cannot increment counter - user not authenticated');
      Alert.alert('Error', 'You must be logged in to perform this action.');
      return;
    }
    // Don't await - incrementCounter now uses optimistic updates for instant UI feedback
    incrementCounter(id, user.id, amount).catch((error) => {
      logger.error('Error incrementing counter:', error);
      Alert.alert('Error', `Failed to increment counter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });
  };

  const handleDecrement = async () => {
    if (!id || !counter || counter.total <= 0) {
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (!user?.id) {
      logger.error('[Counter] Cannot decrement counter - user not authenticated');
      Alert.alert('Error', 'You must be logged in to perform this action.');
      return;
    }
    // Don't await - decrementCounter now uses optimistic updates for instant UI feedback
    decrementCounter(id, user.id, 1).catch((error) => {
      logger.error('Error decrementing counter:', error);
      Alert.alert('Error', `Failed to decrement counter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });
  };

  const handleReset = () => {
    if (!id || !counter) return;
    Alert.alert(
      'Reset Counter',
      `Are you sure you want to reset "${counter.name}"? This will set the count to 0.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) {
              logger.error('[Counter] Cannot reset counter - user not authenticated');
              Alert.alert('Error', 'You must be logged in to perform this action.');
              return;
            }
            try {
              await resetCounter(id, user.id);
            } catch (error) {
              logger.error('Error resetting counter:', error);
              Alert.alert('Error', 'Failed to reset counter. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Mark',
      `Are you sure you want to delete "${counter.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCounter(id);
            router.back();
          },
        },
      ]
    );
  };

  const counterIconType = counter
    ? resolveCounterIconType({
        name: counter.name,
        emoji: counter.emoji,
      })
    : undefined;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          bounces={true}
          alwaysBounceVertical={false}
        >
          {/* Header with Emoji Badge */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={[styles.backButton, { color: themeColors.textSecondary }]}>← Back</Text>
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <View
                style={[
                  styles.emojiBadge,
                  {
                    backgroundColor: applyOpacity(counter?.color || themeColors.primary, 0.12),
                  },
                ]}
              >
                {counterIconType ? (
                  <CounterIcon
                    type={counterIconType}
                    size={28}
                    variant="withBackground"
                    fallbackEmoji={counter.emoji || '📊'}
                    ariaLabel={`${counter.name} counter icon`}
                    color={counter?.color}
                  />
                ) : (
                  <Text style={styles.headerEmoji}>{counter.emoji || '📊'}</Text>
                )}
              </View>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>{counter.name}</Text>
            </View>
            <TouchableOpacity 
              style={styles.headerActionButton}
              onPress={() => setShowActionSheet(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Large Value Display with Animated Bump and Progress Ring */}
          <View style={styles.valueDisplay}>
            {/* Progress Ring */}
            <View style={styles.ringContainer}>
              <Svg width={COUNTER_RING_SIZE} height={COUNTER_RING_SIZE} style={styles.ringSvg}>
                {/* Background ring */}
                <Circle
                  cx={COUNTER_RING_SIZE / 2}
                  cy={COUNTER_RING_SIZE / 2}
                  r={COUNTER_RING_RADIUS}
                  stroke={themeColors.surfaceVariant}
                  strokeWidth={COUNTER_RING_STROKE}
                  fill="none"
                  opacity={0.5}
                />
                {/* Progress ring */}
                <Circle
                  cx={COUNTER_RING_SIZE / 2}
                  cy={COUNTER_RING_SIZE / 2}
                  r={COUNTER_RING_RADIUS}
                  stroke={counter.color || themeColors.primary}
                  strokeWidth={COUNTER_RING_STROKE}
                  fill="none"
                  strokeDasharray={COUNTER_RING_CIRCUMFERENCE}
                  strokeDashoffset={COUNTER_RING_CIRCUMFERENCE * (1 - ringProgress)}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${COUNTER_RING_SIZE / 2} ${COUNTER_RING_SIZE / 2})`}
                />
              </Svg>
            </View>
            <Animated.Text 
              style={[
                styles.largeValue, 
                { color: themeColors.text },
                { transform: [{ scale: valueBumpAnim }] }
              ]}
            >
              {counter.total}
            </Animated.Text>
            <Text style={[styles.valueUnit, { color: themeColors.textSecondary }]}>
              {counter.unit}
            </Text>
          </View>

          {/* Quick Action Bar (-, +1) with Rounded Pill */}
          <View style={styles.quickActionBar}>
            <TouchableOpacity
              style={[
                styles.quickActionButton,
                {
                  backgroundColor: counter.total <= 0 
                    ? themeColors.surface 
                    : (counter.color || themeColors.primary),
                  opacity: counter.total <= 0 ? 0.5 : 1,
                },
                shadow.md,
              ]}
              onPressIn={handleDecrement}
              disabled={counter.total <= 0}
              activeOpacity={0.8}
            >
              <Text style={styles.quickActionText}>-</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.quickActionButton,
                { backgroundColor: counter.color || themeColors.primary },
                shadow.md,
              ]}
              onPressIn={() => handleIncrement(1)}
              activeOpacity={0.8}
            >
              <Text style={styles.quickActionText}>+1</Text>
            </TouchableOpacity>
          </View>

          {/* Streak Module with Brand/Primary Tint (12% opacity) - Moved down */}
          {streak && counter.enable_streak && (
            <LinearGradient
              colors={[
                (counter.color || themeColors.primary) + '20',
                (counter.color || themeColors.primary) + '12',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.streakModule, { borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : themeColors.border }]}
            >
              <View style={styles.streakItem}>
                <Ionicons name="flame" size={20} color={themeColors.accent.secondary} />
                <Text style={[styles.streakValue, { color: themeColors.text }]}>
                  {streak.current_streak}
                </Text>
                <Text style={[styles.streakLabel, { color: themeColors.textSecondary }]}>
                  Current Streak
                </Text>
              </View>
              <View style={[styles.streakDivider, { backgroundColor: themeColors.border }]} />
              <View style={styles.streakItem}>
                {streak.longest_streak > 7 ? (
                  <Ionicons name="trophy" size={20} color={themeColors.accent.secondary} />
                ) : (
                  <Ionicons name="flame" size={20} color={themeColors.accent.secondary} />
                )}
                <Text style={[styles.streakValue, { color: themeColors.text }]}>
                  {streak.longest_streak}
                </Text>
                <Text style={[styles.streakLabel, { color: themeColors.textSecondary }]}>
                  Longest Streak
                </Text>
              </View>
            </LinearGradient>
          )}

          {/* Footer Actions - Show in Action Sheet (bottom sheet) */}
          {showActionSheet && (
            <View style={styles.actionSheetOverlay}>
              <TouchableOpacity 
                style={styles.actionSheetBackdrop}
                onPress={() => setShowActionSheet(false)}
                activeOpacity={1}
              />
              <View style={[styles.actionSheet, { backgroundColor: themeColors.surface }, shadow.lg]}>
                <View style={[styles.actionSheetHandle, { backgroundColor: themeColors.border }]} />
                <TouchableOpacity
                  style={[styles.actionSheetItem, { borderBottomColor: themeColors.border }]}
                  onPress={() => {
                    setShowActionSheet(false);
                    handleReset();
                  }}
                >
                  <Text style={[styles.actionSheetItemText, { color: (themeColors as any).reset || themeColors.warning }]}>
                    Reset Counter
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => {
                    setShowActionSheet(false);
                    handleDelete();
                  }}
                >
                  <Text style={[styles.actionSheetItemText, { color: themeColors.error }]}>
                    Delete Mark
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: fontSize.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Header with Emoji Badge
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: spacing.md,
  },
  emojiBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerEmoji: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  headerActionButton: {
    padding: spacing.xs,
  },
  // Large Value Display - Centered with ring
  valueDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    position: 'relative',
    minHeight: COUNTER_RING_SIZE + 100, // Ensure enough space for ring and text
  },
  ringContainer: {
    position: 'absolute',
    width: COUNTER_RING_SIZE,
    height: COUNTER_RING_SIZE,
    top: '50%',
    marginTop: -COUNTER_RING_SIZE / 2, // Center vertically
    left: '50%',
    marginLeft: -COUNTER_RING_SIZE / 2, // Center horizontally
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: {
    position: 'absolute',
  },
  largeValue: {
    fontSize: 80,
    fontWeight: fontWeight.bold,
    lineHeight: 80,
  },
  valueUnit: {
    fontSize: fontSize.lg,
    marginTop: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  // Goal / Progress Module
  goalModule: {
    padding: spacing.lg,
    borderRadius: borderRadius.card, // Increased for more rounded corners
    borderWidth: 1, // Border width
    borderColor: 'transparent', // Default transparent, will be overridden by inline style
    marginBottom: spacing.lg,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  goalTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  goalSubtitle: {
    fontSize: fontSize.sm,
  },
  setGoalButton: {
    borderWidth: 1, // Border width
    borderColor: 'transparent', // Default transparent, will be overridden by inline style
    borderRadius: borderRadius.lg, // Increased for more rounded corners
    padding: spacing.md,
    alignItems: 'center',
  },
  setGoalButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  // Streak Module
  streakModule: {
    flexDirection: 'row',
    padding: spacing.lg,
    borderRadius: borderRadius.card, // Increased for more rounded corners
    borderWidth: 1, // Border width
    borderColor: 'transparent', // Default transparent, will be overridden by inline style
    marginBottom: spacing.lg,
  },
  streakItem: {
    flex: 1,
    alignItems: 'center',
  },
  streakIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  streakValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  streakLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  streakDivider: {
    width: 1,
    marginHorizontal: spacing.md,
  },
  // Insight Bubble
  insightBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg, // Increased for more rounded corners
    borderWidth: 1, // Border width
    borderColor: 'transparent', // Default transparent, will be overridden by inline style
    marginBottom: spacing.lg,
  },
  insightIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  insightText: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  insightSubtext: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  // Quick Action Bar
  quickActionBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  quickActionButton: {
    minWidth: 64,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  quickActionText: {
    color: '#FFFFFF',
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  // Chart Section
  chartSection: {
    padding: spacing.lg,
    borderRadius: borderRadius.card, // Increased for more rounded corners
    borderWidth: 1, // Border width
    borderColor: 'transparent', // Default transparent, will be overridden by inline style
    marginBottom: spacing.lg,
    // shadow.card removed per user request
  },
  // Action Sheet (Bottom Sheet)
  actionSheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  actionSheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  actionSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xl,
    maxHeight: '50%',
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  actionSheetItem: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  actionSheetItemText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  // Progress Bar
  progressBarTrack: {
    height: 12,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});

