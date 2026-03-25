import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Share,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useCounters } from '../hooks/useCounters';
import { useEventsStore } from '../state/eventsSlice';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/utils/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────

function getWeekWindow(): { start: Date; end: Date; label: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun
  const start = new Date(today);
  start.setDate(today.getDate() - ((dayOfWeek + 6) % 7)); // Back to Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` };
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FULL_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MOTIVATIONAL_MESSAGES: Array<(days: number) => string | null> = [
  (days: number) => days === 7 ? "Perfect week. Every single day. 🏆" : null,
  (days: number) => days >= 5 ? `Showed up ${days} out of 7 days. Solid rhythm.` : null,
  (days: number) => days >= 3 ? `${days} active days. Momentum is building.` : null,
  (days: number) => days >= 1 ? `${days} day${days > 1 ? 's' : ''} active. Every start counts.` : null,
  () => "A quiet week. Tomorrow is a fresh start.",
];

function getMotivationalMessage(activeDays: number): string {
  for (const fn of MOTIVATIONAL_MESSAGES) {
    const msg = fn(activeDays);
    if (msg) return msg;
  }
  return "A quiet week. Tomorrow is a fresh start.";
}

// ─────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────

interface StatPillProps {
  value: string;
  label: string;
  accent?: boolean;
  color: string;
}

const StatPill: React.FC<StatPillProps> = ({ value, label, accent, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 8,
      delay: accent ? 100 : 200,
    }).start();
  }, []);

  return (
    <Animated.View style={[pillStyles.container, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={[pillStyles.value, { color: accent ? color : themeColors.text }]}>
        {value}
      </Text>
      <Text style={[pillStyles.label, { color: themeColors.textSecondary }]}>{label}</Text>
    </Animated.View>
  );
};

const pillStyles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  value: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 },
});

// ─────────────────────────────────────────────────────────

interface DayDotProps {
  label: string;
  active: boolean;
  isToday: boolean;
  intensity: number; // 0–1
  color: string;
  index: number;
}

const DayDot: React.FC<DayDotProps> = ({ label, active, isToday, intensity, color, index }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 8,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const bgColor = active
    ? color + Math.round(Math.max(0.4, intensity) * 255).toString(16).padStart(2, '0')
    : theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <Animated.View
      style={[
        dotStyles.wrapper,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View
        style={[
          dotStyles.dot,
          {
            backgroundColor: bgColor,
            borderWidth: isToday ? 2 : 0,
            borderColor: isToday ? color : 'transparent',
          },
        ]}
      >
        {active && (
          <View style={[dotStyles.checkDot, { backgroundColor: '#fff' }]} />
        )}
      </View>
      <Text style={[dotStyles.label, { color: isToday ? color : themeColors.textSecondary }]}>
        {label}
      </Text>
    </Animated.View>
  );
};

const dotStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 40, height: 40, borderRadius: 12 },
  checkDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', bottom: 7, right: 7 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
});

// ─────────────────────────────────────────────────────────

interface CounterBarProps {
  rank: number;
  emoji: string;
  name: string;
  count: number;
  maxCount: number;
  color: string;
  index: number;
}

const CounterBar: React.FC<CounterBarProps> = ({ rank, emoji, name, count, maxCount, color, index }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(barAnim, {
        toValue: maxCount > 0 ? count / maxCount : 0,
        duration: 600,
        delay: 200 + index * 80,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const rankColor = rankColors[rank - 1] || themeColors.textSecondary;

  return (
    <Animated.View
      style={[
        barStyles.container,
        {
          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          opacity: fadeAnim,
        },
      ]}
    >
      <View style={barStyles.topRow}>
        <View style={barStyles.left}>
          <View style={[barStyles.rankBadge, { backgroundColor: rankColor + '22' }]}>
            <Text style={[barStyles.rankText, { color: rankColor }]}>#{rank}</Text>
          </View>
          <Text style={barStyles.emoji}>{emoji}</Text>
          <Text style={[barStyles.name, { color: themeColors.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={[barStyles.count, { color: color }]}>{count}</Text>
      </View>
      <View style={[barStyles.track, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
        <Animated.View
          style={[
            barStyles.fill,
            {
              backgroundColor: color,
              width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
    </Animated.View>
  );
};

const barStyles = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  rankBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  rankText: { fontSize: 11, fontWeight: '700' },
  emoji: { fontSize: 20 },
  name: { fontSize: 15, fontWeight: '500', flex: 1 },
  count: { fontSize: 22, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

// ─────────────────────────────────────────────────────────

interface StreakRowProps {
  emoji: string;
  name: string;
  streak: number;
  color: string;
  index: number;
}

const StreakRow: React.FC<StreakRowProps> = ({ emoji, name, streak, color, index }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 70, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 100, friction: 10, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  const flameSize = streak >= 7 ? 20 : streak >= 3 ? 18 : 16;

  return (
    <Animated.View
      style={[
        streakRowStyles.row,
        {
          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <Text style={streakRowStyles.emoji}>{emoji}</Text>
      <Text style={[streakRowStyles.name, { color: themeColors.text }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={streakRowStyles.right}>
        <Text style={{ fontSize: flameSize }}>🔥</Text>
        <Text style={[streakRowStyles.streakNum, { color: color }]}>{streak}</Text>
        <Text style={[streakRowStyles.streakLabel, { color: themeColors.textSecondary }]}>
          day{streak !== 1 ? 's' : ''}
        </Text>
      </View>
    </Animated.View>
  );
};

const streakRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8, gap: 10 },
  emoji: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '500', flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakNum: { fontSize: 18, fontWeight: '700' },
  streakLabel: { fontSize: 12, fontWeight: '500' },
});

// ─────────────────────────────────────────────────────────
//  Main Screen
// ─────────────────────────────────────────────────────────

export default function WeeklyReviewScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const { counters } = useCounters();
  const allEvents = useEventsStore(s => s.events);
  const { user } = useAuth();
  const [showDebug, setShowDebug] = useState(false);
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  // Accent colour: use first counter's colour or primary
  const accentColor = counters[0]?.color || themeColors.primary;

  useEffect(() => {
    Animated.timing(headerFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // ── Compute week window ───────────────────────────────
  const { start: weekStart, end: weekEnd, label: weekLabel } = useMemo(() => getWeekWindow(), []);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      dates.push(toLocalDateStr(d));
    }
    return dates;
  }, [weekStart]);

  // ── Filter events in window ───────────────────────────
  const weekEvents = useMemo(() => {
    return allEvents.filter(e => {
      if (e.deleted_at) return false;
      if (e.event_type !== 'increment') return false;
      return e.occurred_local_date >= weekDates[0] && e.occurred_local_date <= weekDates[6];
    });
  }, [allEvents, weekDates]);

  // ── Total marks this week ─────────────────────────────
  const totalMarksThisWeek = weekEvents.reduce((s, e) => s + (e.amount ?? 1), 0);

  // ── Days active ───────────────────────────────────────
  const activeDaysSet = useMemo(() => new Set(weekEvents.map(e => e.occurred_local_date)), [weekEvents]);
  const activeDaysCount = activeDaysSet.size;

  // ── Day activity map for dots (count per day) ─────────
  const dayActivityMap = useMemo(() => {
    const map = new Map<string, number>();
    weekEvents.forEach(e => {
      map.set(e.occurred_local_date, (map.get(e.occurred_local_date) ?? 0) + (e.amount ?? 1));
    });
    return map;
  }, [weekEvents]);

  const maxDayActivity = useMemo(
    () => Math.max(1, ...Array.from(dayActivityMap.values())),
    [dayActivityMap],
  );

  // ── Best day ──────────────────────────────────────────
  const bestDay = useMemo(() => {
    let bestDate = '';
    let bestCount = 0;
    dayActivityMap.forEach((count, date) => {
      if (count > bestCount) { bestCount = count; bestDate = date; }
    });
    if (!bestDate) return '—';
    const d = new Date(bestDate + 'T12:00:00');
    return FULL_DAY_NAMES[d.getDay()];
  }, [dayActivityMap]);

  // ── Today's date string ───────────────────────────────
  const todayStr = toLocalDateStr(new Date());

  // ── Top counters by week count ────────────────────────
  const topCounters = useMemo(() => {
    const countMap = new Map<string, number>();
    weekEvents.forEach(e => {
      countMap.set(e.mark_id, (countMap.get(e.mark_id) ?? 0) + (e.amount ?? 1));
    });
    const sorted = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const maxCount = sorted[0]?.[1] ?? 1;
    return sorted.map(([markId, count], i) => {
      const counter = counters.find(c => c.id === markId);
      return {
        rank: i + 1,
        markId,
        emoji: counter?.emoji ?? '📊',
        name: counter?.name ?? 'Unknown',
        count,
        maxCount,
        color: counter?.color ?? accentColor,
      };
    });
  }, [weekEvents, counters, accentColor]);

  // ── Streak highlights (active streaks > 0) ────────────
  const streakHighlights = useMemo(() => {
    return counters
      .filter(c => !c.deleted_at)
      .map(c => {
        let streak = 0;
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = toLocalDateStr(d);
          const hasActivity = allEvents.some(
            e => e.mark_id === c.id && e.occurred_local_date === dateStr && !e.deleted_at && e.event_type === 'increment',
          );
          if (hasActivity) streak++;
          else if (streak > 0) break;
        }
        return { id: c.id, emoji: c.emoji ?? '📊', name: c.name, streak, color: c.color ?? accentColor };
      })
      .filter(s => s.streak >= 2)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 4);
  }, [counters, allEvents, accentColor]);

  // ── Debug info ────────────────────────────────────────
  const debugInfo = useMemo(() => ({
    window: `${weekDates[0]} → ${weekDates[6]}`,
    eventsInWindow: weekEvents.length,
    windowUsers: [...new Set(weekEvents.map(e => e.user_id))].join(', '),
    windowDates: weekDates.join(', '),
    seedUserId: user?.id ?? 'none',
    authUserId: user?.id ?? 'none',
  }), [weekEvents, weekDates, user]);

  // ── Share ─────────────────────────────────────────────
  const handleShare = async () => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const topLine = topCounters.map(c => `${c.emoji} ${c.name}: ${c.count}`).join('\n');
    const streakLine = streakHighlights.map(s => `${s.emoji} ${s.name}: ${s.streak} days`).join('\n');
    try {
      await Share.share({
        message: [
          `📅 Weekly Review — ${weekLabel}`,
          ``,
          `${totalMarksThisWeek} marks across ${activeDaysCount}/7 days`,
          ``,
          topLine && `Top marks:\n${topLine}`,
          streakLine && `\nStreaks:\n${streakLine}`,
        ].filter(Boolean).join('\n'),
      });
    } catch (e) {
      logger.error('[WeeklyReview] share error:', e);
    }
  };

  // ── Render ────────────────────────────────────────────

  const sectionLabelStyle = [styles.sectionLabel, { color: themeColors.textSecondary }];
  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >

        {/* ── HEADER CARD ── */}
        <Animated.View style={{ opacity: headerFadeAnim }}>
          <LinearGradient
            colors={
              isDark
                ? [accentColor + '28', accentColor + '10', 'transparent']
                : [accentColor + '18', accentColor + '08', 'transparent']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.headerCard,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
              },
            ]}
          >
            {/* Title row */}
            <View style={styles.titleRow}>
              <View>
                <Text style={[styles.screenTitle, { color: themeColors.text }]}>
                  Weekly Review
                </Text>
                <Text style={[styles.dateRange, { color: themeColors.textSecondary }]}>
                  {weekLabel}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }]}
                onPress={handleShare}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={16} color={themeColors.text} />
                <Text style={[styles.shareBtnText, { color: themeColors.text }]}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <StatPill
                value={String(totalMarksThisWeek)}
                label="Marks this week"
                accent
                color={accentColor}
              />
              <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' }]} />
              <StatPill
                value={`${activeDaysCount}/7`}
                label="Days active"
                color={accentColor}
              />
              <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' }]} />
              <StatPill
                value={bestDay}
                label="Best day"
                color={accentColor}
              />
            </View>

            {/* Motivational line */}
            <View style={[styles.motivationRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Text style={[styles.motivationText, { color: themeColors.textSecondary }]}>
                {getMotivationalMessage(activeDaysCount)}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── WEEK RHYTHM ── */}
        <View style={styles.section}>
          <Text style={sectionLabelStyle}>WEEK RHYTHM</Text>
          <View style={styles.dotsRow}>
            {weekDates.map((dateStr, i) => {
              const d = new Date(dateStr + 'T12:00:00');
              const dayLabel = FULL_DAY_NAMES[d.getDay()];
              const count = dayActivityMap.get(dateStr) ?? 0;
              const active = count > 0;
              const intensity = active ? count / maxDayActivity : 0;
              const isToday = dateStr === todayStr;
              return (
                <DayDot
                  key={dateStr}
                  label={dayLabel}
                  active={active}
                  isToday={isToday}
                  intensity={intensity}
                  color={accentColor}
                  index={i}
                />
              );
            })}
          </View>
        </View>

        {/* ── TOP COUNTERS ── */}
        {topCounters.length > 0 && (
          <View style={styles.section}>
            <Text style={sectionLabelStyle}>TOP MARKS</Text>
            {topCounters.map((item, i) => (
              <CounterBar
                key={item.markId}
                rank={item.rank}
                emoji={item.emoji}
                name={item.name}
                count={item.count}
                maxCount={item.maxCount}
                color={item.color}
                index={i}
              />
            ))}
          </View>
        )}

        {/* ── STREAK HIGHLIGHTS ── */}
        {streakHighlights.length > 0 && (
          <View style={styles.section}>
            <Text style={sectionLabelStyle}>STREAK HIGHLIGHTS</Text>
            {streakHighlights.map((s, i) => (
              <StreakRow
                key={s.id}
                emoji={s.emoji}
                name={s.name}
                streak={s.streak}
                color={s.color}
                index={i}
              />
            ))}
          </View>
        )}

        {/* ── EMPTY STATE ── */}
        {totalMarksThisWeek === 0 && (
          <View style={[styles.emptyState, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No marks yet this week</Text>
            <Text style={[styles.emptySub, { color: themeColors.textSecondary }]}>
              Head to your marks and start logging — this page will come alive.
            </Text>
          </View>
        )}

        {/* ── DEBUG TOGGLE ── */}
        {__DEV__ && (
          <TouchableOpacity
            style={[styles.debugToggle, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
            onPress={() => setShowDebug(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.debugToggleText, { color: themeColors.textSecondary }]}>
              {showDebug ? '▲ Hide debug info' : '▼ Show debug info'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── DEBUG PANEL ── */}
        {__DEV__ && showDebug && (
          <View style={[styles.debugPanel, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Text style={[styles.debugTitle, { color: themeColors.textSecondary }]}>WEEKLY REVIEW DEBUG</Text>
            {Object.entries(debugInfo).map(([k, v]) => (
              <Text key={k} style={[styles.debugLine, { color: themeColors.textSecondary }]}>
                <Text style={{ fontWeight: '600' }}>{k}:</Text> {v}
              </Text>
            ))}
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },

  // Header card
  headerCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  dateRange: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.2,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 0,
  },
  statDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 0,
  },
  motivationRow: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  motivationText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  // Dots row
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

  // Debug
  debugToggle: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  debugToggleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  debugPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    marginBottom: 8,
  },
  debugTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  debugLine: {
    fontSize: 11,
    lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
