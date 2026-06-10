/**
 * Profile screen — Livra 2.0 Layer 5.
 * Identity mirror: Name → Momentum → Title → Mark stats → Share.
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { GearSix, ShareNetwork } from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useAuth } from '../../hooks/useAuth';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { AppText } from '../../components/Typography';
import { MomentumCounter } from '../../components/MomentumCounter';
import { calculateMomentum, getCurrentTitle, computeMarkStats } from '../../lib/momentum';
import { applyOpacity } from '@/src/components/icons/color';
import { getSupabaseClient } from '../../lib/supabase';
import { logger } from '../../lib/utils/logger';
import type { User } from '@supabase/supabase-js';
import { ShareCardModal } from '../../components/ShareCard';
import { formatDate } from '../../lib/date';

function displayNameFromUserMetadata(user: User): string | null {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (!meta) return null;
  for (const key of ['full_name', 'name', 'display_name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export default function ProfileScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const router = useRouter();
  const { user } = useAuth();
  const { counters, loading } = useCounters();
  const allEvents = useEventsStore(s => s.events);

  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);

  // Staggered entry animation
  const headerOpacity  = useSharedValue(0);
  const counterOpacity = useSharedValue(0);
  const titleOpacity   = useSharedValue(0);
  const statsOpacity   = useSharedValue(0);
  const shareOpacity   = useSharedValue(0);

  // Re-trigger animation on focus
  useFocusEffect(
    React.useCallback(() => {
      headerOpacity.value  = 0;
      counterOpacity.value = 0;
      titleOpacity.value   = 0;
      statsOpacity.value   = 0;
      shareOpacity.value   = 0;

      headerOpacity.value  = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
      counterOpacity.value = withDelay(150, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }));
      titleOpacity.value   = withDelay(300, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }));
      statsOpacity.value   = withDelay(450, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }));
      shareOpacity.value   = withDelay(600, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }));
    }, []),
  );

  const headerStyle  = useAnimatedStyle(() => ({ opacity: headerOpacity.value }));
  const counterStyle = useAnimatedStyle(() => ({ opacity: counterOpacity.value }));
  const titleStyle   = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const statsStyle   = useAnimatedStyle(() => ({ opacity: statsOpacity.value }));
  const shareStyle   = useAnimatedStyle(() => ({ opacity: shareOpacity.value }));

  // Load display name from Supabase profiles
  useEffect(() => {
    if (!user?.id) { setProfileDisplayName(null); return; }
    let cancelled = false;
    const supabase = getSupabaseClient();
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setProfileDisplayName(data?.display_name?.trim() || null);
      } catch {
        if (!cancelled) setProfileDisplayName(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Load avatar
  useEffect(() => {
    AsyncStorage.getItem('profile_image_uri').then(uri => {
      if (uri && !uri.startsWith('http')) setProfileImageUri(uri);
    }).catch(() => {});
  }, []);

  const profileName = useMemo(() => {
    if (!user) return 'You';
    if (profileDisplayName) return profileDisplayName;
    const fromMeta = displayNameFromUserMetadata(user);
    if (fromMeta) return fromMeta;
    const email = user.email;
    if (email) return email.split('@')[0];
    return 'You';
  }, [user, profileDisplayName]);

  const activeCounters = useMemo(() => counters.filter(c => !c.deleted_at), [counters]);

  // Compute momentum + title from full history
  const { momentum, title, markStats, totalDaysLogged, longestStreak } = useMemo(() => {
    const incrementEvents = allEvents.filter(e => !e.deleted_at && e.event_type === 'increment');
    const totalMarksLogged = incrementEvents.length;

    // Unique logged dates for total days
    const uniqueDates = [...new Set(incrementEvents.map(e => e.occurred_local_date))].sort();
    const totalDays = uniqueDates.length;

    // Overall longest streak
    let longest = 0;
    let cur = 0;
    for (let i = 0; i < uniqueDates.length; i++) {
      if (i === 0) { cur = 1; continue; }
      const prev = new Date(uniqueDates[i - 1] + 'T00:00:00');
      const curr = new Date(uniqueDates[i]     + 'T00:00:00');
      const gap  = (curr.getTime() - prev.getTime()) / 86400000;
      cur = gap === 1 ? cur + 1 : 1;
      if (cur > longest) longest = cur;
    }
    if (cur > longest) longest = cur;

    const m = calculateMomentum(totalMarksLogged, longest);
    const t = getCurrentTitle(totalDays, longest);
    const stats = computeMarkStats(
      allEvents.filter(e => !e.deleted_at) as any,
      activeCounters.map(c => ({ id: c.id, name: c.name })),
    );

    return { momentum: m, title: t, markStats: stats, totalDaysLogged: totalDays, longestStreak: longest };
  }, [allEvents, activeCounters]);

  // Last 28 days log map (for share card)
  const logsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      map[e.occurred_local_date] = (map[e.occurred_local_date] ?? 0) + 1;
    });
    return map;
  }, [allEvents]);

  // Most consistent mark color (for share card accent)
  const dominantColor = useMemo(() => {
    if (!markStats.length) return themeColors.accent.primary;
    const best = markStats.reduce((a, b) => a.totalLogged >= b.totalLogged ? a : b);
    const mark = activeCounters.find(c => c.id === best.markId);
    return (mark as any)?.color ?? themeColors.accent.primary;
  }, [markStats, activeCounters, themeColors]);

  if (loading) return <LoadingScreen />;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        {/* Settings gear — top right */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            {profileImageUri ? (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/settings')}
                style={[styles.avatar, { borderColor: applyOpacity(themeColors.border, 0.5) }]}
              >
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings')}
            style={styles.gearBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <GearSix size={22} color={themeColors.textSecondary} weight="regular" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <Animated.View style={[styles.nameBlock, headerStyle]}>
            <AppText style={[styles.name, { color: themeColors.text }]}>
              {profileName}
            </AppText>
          </Animated.View>

          {/* Momentum number */}
          <Animated.View style={[styles.momentumBlock, counterStyle]}>
            <MomentumCounter value={momentum} color={themeColors.accent.primary} duration={1500} />
            <AppText style={[styles.momentumLabel, { color: themeColors.textTertiary }]}>
              momentum
            </AppText>
          </Animated.View>

          {/* Title */}
          <Animated.View style={[styles.titleBlock, titleStyle]}>
            <AppText style={[styles.titleText, { color: themeColors.textSecondary }]}>
              {title}
            </AppText>
          </Animated.View>

          {/* Mark lifetime stats */}
          <Animated.View style={[styles.statsBlock, statsStyle]}>
            {markStats.length === 0 ? (
              <AppText style={[styles.emptyStats, { color: themeColors.textTertiary }]}>
                Start logging to see your history.
              </AppText>
            ) : (
              markStats.map(stat => (
                <View key={stat.markId} style={styles.statRow}>
                  <AppText style={[styles.statName, { color: themeColors.text }]} numberOfLines={1}>
                    {stat.name}
                  </AppText>
                  <View style={styles.statNumbers}>
                    <AppText style={[styles.statValue, { color: themeColors.textSecondary }]}>
                      {stat.totalLogged} logged
                    </AppText>
                    <AppText style={[styles.statDivider, { color: themeColors.textTertiary }]}>
                      ·
                    </AppText>
                    <AppText style={[styles.statValue, { color: themeColors.textSecondary }]}>
                      Best streak: {stat.bestStreak} {stat.bestStreak === 1 ? 'day' : 'days'}
                    </AppText>
                  </View>
                </View>
              ))
            )}
          </Animated.View>

          {/* Share button */}
          <Animated.View style={[styles.shareBlock, shareStyle]}>
            <TouchableOpacity
              style={[
                styles.shareBtn,
                {
                  borderColor: applyOpacity(themeColors.accent.primary, isDark ? 0.4 : 0.5),
                  backgroundColor: applyOpacity(themeColors.accent.primary, isDark ? 0.08 : 0.06),
                },
              ]}
              onPress={() => setShowShareCard(true)}
              activeOpacity={0.78}
            >
              <ShareNetwork size={18} color={themeColors.accent.primary} weight="regular" />
              <AppText style={[styles.shareBtnText, { color: themeColors.accent.primary }]}>
                Share your momentum.
              </AppText>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>

        {/* Share card modal */}
        <ShareCardModal
          visible={showShareCard}
          onClose={() => setShowShareCard(false)}
          title={title}
          momentum={momentum}
          logsByDate={logsByDate}
          totalMarks={activeCounters.length}
          accentColor={dominantColor}
          profileName={profileName}
        />
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    minHeight: 48,
  },
  topBarLeft: {
    width: 36,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 32,
    height: 32,
  },
  gearBtn: {
    padding: spacing.xs,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'] ?? 64,
    alignItems: 'center',
  },
  nameBlock: {
    marginTop: spacing['3xl'] ?? 48,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  name: {
    fontSize: fontSize['3xl'] ?? 36,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  momentumBlock: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  momentumLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: spacing.xxs ?? 4,
  },
  titleBlock: {
    marginTop: spacing.md,
    marginBottom: 32,
    alignItems: 'center',
  },
  titleText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  statsBlock: {
    width: '100%',
    gap: spacing.md,
    marginBottom: 32,
  },
  emptyStats: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  statRow: {
    gap: spacing.xxs ?? 4,
  },
  statName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.1,
  },
  statNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '400',
  },
  statDivider: {
    fontSize: fontSize.sm,
  },
  shareBlock: {
    width: '100%',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.1,
  },
});
