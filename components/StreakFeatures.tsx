import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { getMilestoneForStreak, getNextMilestone, getEffectiveSkipTokens, todayISO } from '../lib/features';
import { useFeaturesStore } from '../state/featuresSlice';
import { useMarksStore } from '../state/countersSlice';

// ── Milestone Banner ──────────────────────────────────────

interface StreakMilestoneBannerProps {
  streak: number;
  color: string;
}

export const StreakMilestoneBanner: React.FC<StreakMilestoneBannerProps> = ({ streak, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const milestone = getMilestoneForStreak(streak);
  const next = getNextMilestone(streak);

  if (!milestone && !next) return null;

  return (
    <LinearGradient
      colors={[color + '22', color + '0A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.milestoneBanner, { borderColor: color + '40' }]}
    >
      <View style={styles.milestoneRow}>
        <Text style={styles.milestoneEmoji}>{milestone ? milestone.emoji : '🌱'}</Text>
        <View style={{ flex: 1 }}>
          {milestone && (
            <Text style={[styles.milestoneTitle, { color: themeColors.text }]}>
              {milestone.label}
            </Text>
          )}
          {next && (
            <Text style={[styles.milestoneSub, { color: themeColors.textSecondary }]}>
              {milestone
                ? `Next: ${next.label} at ${next.days} days (${next.days - streak} to go)`
                : `First milestone in ${next.days - streak} day${next.days - streak !== 1 ? 's' : ''}`}
            </Text>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

// ── Skip Token Row ────────────────────────────────────────

interface SkipTokenRowProps {
  markId: string;
  userId: string;
  color: string;
}

export const SkipTokenRow: React.FC<SkipTokenRowProps> = ({ markId, userId, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const mark = useMarksStore(s => s.marks.find(m => m.id === markId));
  const { isDateProtected, useSkipToken } = useFeaturesStore();
  const [loading, setLoading] = useState(false);

  if (!mark) return null;

  const available = getEffectiveSkipTokens(mark);
  const today = todayISO();
  const isProtected = isDateProtected(markId, today);

  const handleUse = () => {
    if (available <= 0) {
      Alert.alert('No tokens left', 'Skip tokens refill at the start of each month.');
      return;
    }
    if (isProtected) {
      Alert.alert('Already protected', "Today's streak is already protected.");
      return;
    }
    Alert.alert(
      'Use a skip token?',
      `Protect your streak for today. You have ${available} token${available !== 1 ? 's' : ''} left this month.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use token',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setLoading(true);
            const result = await useSkipToken(markId, userId, today);
            setLoading(false);
            if (!result.success) Alert.alert('Error', result.message);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.tokenRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tokenTitle, { color: themeColors.text }]}>Skip tokens</Text>
        <Text style={[styles.tokenSub, { color: themeColors.textSecondary }]}>
          Protect your streak on missed days · resets monthly
        </Text>
      </View>
      <View style={styles.tokenRight}>
        <View style={styles.tokenDots}>
          {[0, 1].map(i => (
            <View
              key={i}
              style={[
                styles.tokenDot,
                {
                  backgroundColor: i < available ? color : 'transparent',
                  borderColor: i < available ? color : themeColors.border,
                },
              ]}
            />
          ))}
        </View>
        {isProtected ? (
          <View style={styles.protectedRow}>
            <Ionicons name="shield-checkmark" size={14} color={color} />
            <Text style={[styles.protectedText, { color }]}>Protected</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.useBtn,
              {
                backgroundColor: available > 0 ? color + '20' : themeColors.surface,
                borderColor: available > 0 ? color : themeColors.border,
              },
            ]}
            onPress={handleUse}
            disabled={loading || available <= 0}
            activeOpacity={0.7}
          >
            <Text style={[styles.useBtnText, { color: available > 0 ? color : themeColors.textSecondary }]}>
              {loading ? '…' : 'Use'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  milestoneBanner: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneEmoji: { fontSize: 24 },
  milestoneTitle: { fontSize: 15, fontWeight: '600' },
  milestoneSub: { fontSize: 12, marginTop: 2 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  tokenTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  tokenSub: { fontSize: 11, lineHeight: 15 },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  tokenDots: { flexDirection: 'row', gap: 6 },
  tokenDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  protectedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  protectedText: { fontSize: 11, fontWeight: '500' },
  useBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  useBtnText: { fontSize: 11, fontWeight: '600' },
});
