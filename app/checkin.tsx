import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useCheckinsStore } from '../state/checkinsSlice';
import { useAuth } from '../hooks/useAuth';
import { Logo } from '../components/Logo';

export default function CheckinScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const goals = useGoalsStore(s => s.goals);
  const activeGoal = goals.find(g => g.status === 'active');
  const goalId = activeGoal?.id ?? '';
  const getTodayCheckin = useCheckinsStore(s => s.getTodayCheckin);
  const getCheckinStreak = useCheckinsStore(s => s.getCheckinStreak);
  const recordCheckin = useCheckinsStore(s => s.recordCheckin);

  const existingCheckin = getTodayCheckin(goalId);
  const streak = getCheckinStreak(goalId);

  const [answered, setAnswered] = useState(existingCheckin !== undefined);
  const [response, setResponse] = useState<boolean | null>(existingCheckin?.showed_up ?? null);

  const handleAnswer = async (showedUp: boolean) => {
    if (!user?.id || !goalId) return;
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      await recordCheckin(user.id, goalId, showedUp);
      setResponse(showedUp);
      setAnswered(true);
      // Auto-dismiss after 1.8 seconds on answered
      setTimeout(() => router.back(), 1800);
    } catch {
      Alert.alert('Error', 'Could not save your check-in. Please try again.');
    }
  };

  if (!activeGoal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.logoRow}>
          <Logo size={24} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.noGoalText, { color: themeColors.textSecondary }]}>
            Add a goal first to start checking in.
          </Text>
        </View>
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={[styles.doneBtnText, { color: themeColors.textSecondary }]}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Logo top center */}
      <View style={styles.logoRow}>
        <Logo size={24} />
      </View>

      <View style={styles.center}>
        {!answered ? (
          <>
            {/* Goal context */}
            <Text style={[styles.goalContext, { color: themeColors.textSecondary }]} numberOfLines={2}>
              {activeGoal.title}
            </Text>

            {/* Question */}
            <Text style={[styles.question, { color: themeColors.text }]}>
              Did you show up for this today?
            </Text>

            {/* Response options */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.yesBtn}
                onPress={() => handleAnswer(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.yesBtnText}>I showed up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noBtn, { borderColor: themeColors.border }]}
                onPress={() => handleAnswer(false)}
                activeOpacity={0.85}
              >
                <Text style={[styles.noBtnText, { color: themeColors.textSecondary }]}>
                  Not today
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.responseArea}>
            <Text style={[styles.responseTitle, { color: themeColors.text }]}>
              {response
                ? (streak >= 7 ? `${streak} days.` : streak >= 3 ? 'Keep going.' : 'Logged.')
                : 'Noted.'}
            </Text>
            <Text style={[styles.responseSubtitle, { color: themeColors.textSecondary }]}>
              {response
                ? (streak >= 7 ? "That's the work." : streak >= 3 ? 'Stack another day.' : 'See you tomorrow.')
                : 'Tomorrow is the reset.'}
            </Text>
          </View>
        )}
      </View>

      {/* Skip / Done */}
      {!answered && (
        <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={[styles.doneBtnText, { color: themeColors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logoRow: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  goalContext: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: -spacing.sm,
  },
  question: {
    fontSize: 26,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  noGoalText: {
    fontSize: 16,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  yesBtn: {
    backgroundColor: '#FEB729',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  yesBtnText: {
    color: '#111111',
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  noBtn: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    borderWidth: 1,
  },
  noBtnText: {
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  responseArea: {
    alignItems: 'center',
    gap: spacing.md,
  },
  responseTitle: {
    fontSize: 40,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    letterSpacing: -1,
  },
  responseSubtitle: {
    fontSize: 18,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 26,
  },
  doneBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  doneBtnText: {
    fontSize: 15,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
});
