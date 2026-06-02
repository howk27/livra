import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Plus } from 'phosphor-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { applyOpacity } from '@/src/components/icons/color';

const ACCENT = '#FEB729';
const FREE_MARK_LIMIT = 3;

export default function MarksScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { counters } = useCounters();
  const { isProUnlocked } = useIapSubscriptions();

  const activeMarks = useMemo(
    () => counters.filter(c => !c.deleted_at),
    [counters],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Your marks</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: ACCENT }]}
          onPress={() => router.push('/mark/new' as any)}
          activeOpacity={0.8}
        >
          <Plus size={18} color="#111111" weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {activeMarks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
              No marks yet.
            </Text>
            <Text style={[styles.emptyBody, { color: themeColors.textTertiary }]}>
              Marks are the daily actions that move your goal forward.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: ACCENT }]}
              onPress={() => router.push('/mark/new' as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyBtnText}>Add a mark</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>
              YOUR DAILY MARKS
            </Text>

            {activeMarks.map((mark, index) => {
              const isLocked = !isProUnlocked && index >= FREE_MARK_LIMIT;
              const markColor = mark.color || themeColors.accent.primary;
              const iconBg = applyOpacity(markColor, theme === 'dark' ? 0.20 : 0.18);

              return (
                <TouchableOpacity
                  key={mark.id}
                  style={[
                    styles.markCard,
                    {
                      backgroundColor: themeColors.surface,
                      opacity: isLocked ? 0.55 : 1,
                    },
                  ]}
                  onPress={() => {
                    if (isLocked) {
                      router.push('/paywall');
                    } else {
                      router.push(`/mark/${mark.id}` as any);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  {/* Icon */}
                  <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                    {isLocked ? (
                      <Lock size={18} color={markColor} weight="regular" />
                    ) : mark.emoji ? (
                      <Text style={styles.markEmoji}>{mark.emoji}</Text>
                    ) : null}
                  </View>

                  {/* Label */}
                  <View style={styles.markInfo}>
                    <Text style={[styles.markName, { color: themeColors.text }]} numberOfLines={1}>
                      {mark.name}
                    </Text>
                    {mark.unit ? (
                      <Text style={[styles.markUnit, { color: themeColors.textSecondary }]} numberOfLines={1}>
                        {mark.unit}
                      </Text>
                    ) : null}
                  </View>

                  {/* Lock badge */}
                  {isLocked && (
                    <View style={[styles.lockBadge, { backgroundColor: themeColors.surfaceVariant }]}>
                      <Lock size={12} color={themeColors.textSecondary} weight="regular" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Pro upsell hint for free users at limit */}
            {!isProUnlocked && activeMarks.length >= FREE_MARK_LIMIT && (
              <TouchableOpacity
                style={[styles.upgradeRow, { borderColor: themeColors.border }]}
                onPress={() => router.push('/paywall')}
                activeOpacity={0.8}
              >
                <Text style={[styles.upgradeText, { color: themeColors.textSecondary }]}>
                  Livra+ for more marks
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: fontWeight.bold,
    fontFamily: 'Satoshi',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  markCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markInfo: {
    flex: 1,
    gap: 2,
  },
  markEmoji: {
    fontSize: 18,
  },
  markName: {
    fontSize: 15,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.medium,
  },
  markUnit: {
    fontSize: 12,
    fontFamily: 'Inter',
  },
  lockBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeRow: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  upgradeText: {
    fontSize: 13,
    fontFamily: 'Inter',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  emptyBtnText: {
    fontSize: 15,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#111111',
  },
});
