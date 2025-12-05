import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  FlatList,
  Platform,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { DraggableGrid, IDraggableGridProps } from 'react-native-draggable-grid';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { useFABContext } from './_layout';
import { useCounters } from '../../hooks/useCounters';
import { useCountersStore } from '../../state/countersSlice';
import { CounterTile } from '../../components/CounterTile';
import { EmptyState } from '../../components/EmptyState';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { query, execute } from '../../lib/db';
import { CounterStreak, Counter } from '../../types';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useNotifications } from '../../hooks/useNotifications';
import { AppText } from '../../components/Typography';
import { logger } from '../../lib/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const APP_BRAND_LOGO_LIGHT = require('../../assets/branding/Logo NoBG.png');
const APP_BRAND_LOGO_DARK = require('../../assets/branding/Logo NoBG dark.png');

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_OUTER_PADDING = spacing.lg;
const GRID_COLUMN_GAP = spacing.lg;
const GRID_ROW_GAP = spacing.lg;
const GRID_ITEM_HEIGHT = 260;
const GRID_AVAILABLE_WIDTH = SCREEN_WIDTH - GRID_OUTER_PADDING * 2;
const GRID_BLOCK_WIDTH = GRID_AVAILABLE_WIDTH / 2;

export default function HomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const { counters, loading, incrementCounter, decrementCounter, deleteCounter } = useCounters();
  const { sync } = useSync();
  const { updateSmartNotifications, permissionGranted } = useNotifications();
  const [streaks, setStreaks] = useState<Map<string, CounterStreak>>(new Map());
  const [localCounters, setLocalCounters] = useState<Counter[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const { isEditMode, setIsEditMode } = useFABContext();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollViewYRef = useRef<number>(0);
  const isOnboarded = useUIStore((state) => state.isOnboarded);
  const completeOnboarding = useUIStore((state) => state.completeOnboarding);
  const activeCounterCount = localCounters.length;
  const countersSubtitle = isEditMode
    ? 'Hold & Drag to organize'
    : counters.length
        ? `${counters.length} active mark${counters.length === 1 ? '' : 's'} ready for today`
        : 'Create your first mark to start tracking wins.';

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

  // Load streaks - only reload when counter IDs change, not on every update
  // Use a ref to track previous counter IDs to avoid unnecessary reloads
  const prevCounterIdsRef = useRef<string>('');
  const counterIds = useMemo(() => {
    return counters.map(c => c.id).sort().join(',');
  }, [counters]);
  
  useEffect(() => {
    // Only reload streaks if the counter IDs actually changed (added/removed counters)
    if (counterIds !== prevCounterIdsRef.current) {
      prevCounterIdsRef.current = counterIds;
      const loadStreaks = async () => {
        const streakData = await query<CounterStreak>(
          'SELECT * FROM lc_streaks WHERE deleted_at IS NULL'
        );
        const streakMap = new Map(streakData.map((s) => [s.mark_id, s]));
        setStreaks(streakMap);
      };
      loadStreaks();
    }
  }, [counterIds]);

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
          const profileImagePath = `avatars/${user.id}.jpg`;
          const { data, error } = await supabase.storage
            .from('profile-pictures')
            .createSignedUrl(profileImagePath, 3600); // 1 hour expiry
          
          if (!error && data) {
            setProfileImageUri(data.signedUrl);
            // Also store locally as cache
            await AsyncStorage.setItem('profile_image_uri', data.signedUrl);
            return;
          }
          
          // If not found in Supabase (404 is expected if no image), check local storage as fallback
          if (error && error.message?.includes('not found')) {
            // No image in Supabase, check local storage
            const storedUri = await AsyncStorage.getItem('profile_image_uri');
            if (storedUri && !storedUri.startsWith('http')) {
              // Only use local URI if it's a file path (not a URL)
              setProfileImageUri(storedUri);
            } else if (storedUri && storedUri.startsWith('http')) {
              // Use cached signed URL
              setProfileImageUri(storedUri);
            }
          }
        } else {
          // If not logged in, use local storage only
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && !storedUri.startsWith('http')) {
            setProfileImageUri(storedUri);
          } else if (storedUri && storedUri.startsWith('http')) {
            // Use cached signed URL
            setProfileImageUri(storedUri);
          }
        }
      } catch (error) {
        logger.error('Error loading profile image:', error);
        // Fallback to local storage
        try {
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri) {
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
          const storedUri = await AsyncStorage.getItem('profile_image_uri');
          if (storedUri && storedUri !== profileImageUri) {
            setProfileImageUri(storedUri);
          }
        } catch (error) {
          logger.error('Error checking profile image:', error);
        }
      };
      
      checkProfileImage();
    }, [profileImageUri])
  );

  const handleCreateCounter = () => {
    router.push('/counter/new');
  };

  const handleCounterPress = useCallback((id: string) => {
    router.push(`/counter/${id}`);
  }, [router]);

  const handleQuickIncrement = useCallback((counterId: string) => {
    if (!user?.id) {
      logger.error('[Home] Cannot increment counter - user not authenticated');
      return;
    }
    // Don't await - incrementCounter now uses optimistic updates for instant UI feedback
    incrementCounter(counterId, user.id, 1).catch((error) => {
      logger.error('Error incrementing counter:', error);
    });
    // Update notifications after incrementing (in case streak status changed)
    // Don't await - let it happen in background
    if (permissionGranted) {
      updateSmartNotifications(user?.id).catch((error) => {
        logger.error('Error updating notifications after increment:', error);
      });
    }
  }, [user?.id, incrementCounter, permissionGranted, updateSmartNotifications]);

  const handleQuickDecrement = useCallback((counterId: string) => {
    if (!user?.id) {
      logger.error('[Home] Cannot decrement counter - user not authenticated');
      return;
    }
    // Don't await - decrementCounter now uses optimistic updates for instant UI feedback
    decrementCounter(counterId, user.id, 1).catch((error) => {
      logger.error('Error decrementing counter:', error);
    });
    // Update notifications after decrementing (in case streak status changed)
    if (permissionGranted) {
      updateSmartNotifications(user?.id).catch((error) => {
        logger.error('Error updating notifications after decrement:', error);
      });
    }
  }, [user?.id, decrementCounter, permissionGranted, updateSmartNotifications]);

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
      const streak =
        streaks.get(item.id)
          ? {
              current: streaks.get(item.id)!.current_streak,
              longest: streaks.get(item.id)!.longest_streak,
            }
          : undefined;

      return (
        <View style={styles.gridItemWrapper}>
          <View style={styles.gridItemInner}>
            <CounterTile
              counter={item}
              streak={streak}
              onPress={() => {}}
              onIncrement={() => {}}
              onDecrement={() => {}}
              onDelete={user ? () => deleteCounter(item.id) : undefined}
              interactionsEnabled={false}
              iconType={resolveCounterIconType(item)}
            />
          </View>
        </View>
      );
    },
    [streaks, isEditMode, user, deleteCounter]
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

  // Render item for normal mode (regular FlatList)
  // Memoized to prevent re-creating on every render
  const renderNormalItem = useCallback(({ item }: { item: Counter }) => {
    return (
      <View style={styles.gridItemWrapper}>
        <View style={styles.gridItemInner}>
          <CounterTile
            counter={item}
            streak={
              streaks.get(item.id)
                ? {
                    current: streaks.get(item.id)!.current_streak,
                    longest: streaks.get(item.id)!.longest_streak,
                  }
                : undefined
            }
            onPress={() => handleCounterPress(item.id)}
            onIncrement={() => handleQuickIncrement(item.id)}
            onDecrement={() => handleQuickDecrement(item.id)}
            iconType={resolveCounterIconType(item)}
          />
        </View>
      </View>
    );
  }, [streaks, handleCounterPress, handleQuickIncrement, handleQuickDecrement]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        <View style={styles.headerContainer}>
          <Image
            source={theme === 'dark' ? APP_BRAND_LOGO_DARK : APP_BRAND_LOGO_LIGHT}
            style={styles.brandLogo}
            resizeMode="contain"
          />
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
                <Ionicons
                  name="person-circle"
                  size={40}
                  color={themeColors.primary}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.subheaderRow}>
          <View style={styles.headerLeft}>
            <AppText variant="body" style={{ color: themeColors.textSecondary }}>
              {countersSubtitle}
            </AppText>
          </View>
          <TouchableOpacity
            style={[styles.editPill, { borderColor: themeColors.border }]}
            onPress={() => setIsEditMode(!isEditMode)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isEditMode ? 'checkmark' : 'create-outline'}
              size={18}
              color={themeColors.textSecondary}
            />
            <AppText variant="label" style={[styles.editText, { color: themeColors.text }]}>
              {isEditMode ? 'Done' : 'Edit'}
            </AppText>
          </TouchableOpacity>
        </View>

        {!isOnboarded && (
          <View style={[styles.hintCard, { backgroundColor: themeColors.surface }]}>
            <AppText variant="body" style={{ color: themeColors.text }}>
              Tip: Tap a counter to open details, or long-press to reorder your routine.
            </AppText>
            <View style={styles.hintActions}>
              <TouchableOpacity
                style={[styles.hintButton, { borderColor: themeColors.border }]}
                onPress={async () => {
                  await completeOnboarding(user?.id);
                }}
              >
                <AppText variant="label" style={{ color: themeColors.textSecondary }}>
                  Dismiss
                </AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.hintButtonPrimary, { backgroundColor: themeColors.accent.primary }]}
                onPress={async () => {
                  await completeOnboarding(user?.id);
                  router.push('/onboarding');
                }}
                activeOpacity={0.85}
              >
                <AppText variant="label" style={{ color: themeColors.text }}>
                  Show me
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {localCounters.length === 0 ? (
          <EmptyState
            title={loading ? "Loading marks" : "Start Your Journey"}
            message={loading ? "Please wait while we load your marks..." : "Create your first mark to start tracking your progress and building momentum!"}
            icon={loading ? "⏳" : "✨"}
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
              numColumns={2}
              renderItem={renderGridItem}
              onDragRelease={handleGridDragRelease}
              delayLongPress={180}
              itemHeight={GRID_ITEM_HEIGHT + GRID_ROW_GAP}
              style={styles.draggableGrid}
              dragStartAnimation={styles.dragStartAnimation}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={localCounters}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={renderNormalItem}
            scrollEnabled
            numColumns={2}
            columnWrapperStyle={styles.row}
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
  headerContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 13.6, // Reduced by 15% from 16 (spacing.lg)
    paddingBottom: 3.4, // Reduced by 15% from 4 (spacing.xs)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLogo: {
    width: 94,
    height: 94,
  },
  subheaderRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    gap: spacing.xs,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  editText: {
    letterSpacing: 0.6,
  },
  profileButton: {
    padding: spacing.xs,
    marginLeft: -spacing.xs, // Move icon more to the left
  },
  profileIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
    overflow: 'hidden',
  },
  profileImage: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
  },
  listContent: {
    paddingHorizontal: GRID_OUTER_PADDING - GRID_COLUMN_GAP / 2,
    paddingBottom: spacing['4xl'],
    alignItems: 'center',
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
    width: GRID_BLOCK_WIDTH * 2,
  },
  hintCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.card,
    gap: spacing.md,
  },
  hintActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  hintButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  hintButtonPrimary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
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

