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
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useCheckinsStore } from '../state/checkinsSlice';
import { useAuth } from '../hooks/useAuth';

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
    } catch {
      Alert.alert('Error', 'Could not save your check-in. Please try again.');
    }
  };

  if (!activeGoal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>Done</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={[styles.noGoalText, { color: themeColors.textSecondary }]}>
            Add a goal first to start checking in.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>
          {answered ? 'Done' : 'Skip'}
        </Text>
      </TouchableOpacity>

      <View style={styles.center}>
        {!answered ? (
          <>
            <Text style={[styles.goalContext, { color: themeColors.textSecondary }]}>
              {activeGoal.title}
            </Text>
            <Text style={[styles.question, { color: themeColors.text }]}>
              Did you show up for this today?
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.yesBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => handleAnswer(true)}
              >
                <Text style={styles.yesBtnText}>I showed up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noBtn, { borderColor: themeColors.border }]}
                onPress={() => handleAnswer(false)}
              >
                <Text style={[styles.noBtnText, { color: themeColors.textSecondary }]}>
                  Not today
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {response ? (
              <>
                <Text style={[styles.responseTitle, { color: themeColors.text }]}>
                  {streak >= 7 ? `${streak} days.` : streak >= 3 ? 'Keep going.' : 'Logged.'}
                </Text>
                <Text style={[styles.responseSubtitle, { color: themeColors.textSecondary }]}>
                  {streak >= 7
                    ? "That's the work."
                    : streak >= 3
                    ? 'Stack another day.'
                    : 'See you tomorrow.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.responseTitle, { color: themeColors.text }]}>
                  Noted.
                </Text>
                <Text style={[styles.responseSubtitle, { color: themeColors.textSecondary }]}>
                  Tomorrow is the reset.
                </Text>
              </>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.md },
  closeText: { fontSize: fontSize.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  goalContext: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  question: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: spacing.xl,
  },
  noGoalText: { fontSize: fontSize.md, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm },
  yesBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  yesBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  noBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  noBtnText: { fontSize: fontSize.md },
  responseTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  responseSubtitle: { fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm },
});
