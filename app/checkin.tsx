import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
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
  const recordCheckin = useCheckinsStore(s => s.recordCheckin);
  const checkins = useCheckinsStore(s => s.checkins);
  const [answered, setAnswered] = useState(false);
  const [response, setResponse] = useState<boolean | null>(null);

  const goalId = activeGoal?.id ?? '';
  // Derive check-in state from checkins array directly
  const today = new Date().toISOString().slice(0, 10);
  const alreadyCheckedIn = checkins.some(c => c.goal_id === goalId && c.date === today);
  const streak = (() => {
    const positives = checkins
      .filter(c => c.goal_id === goalId && c.showed_up)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (positives.length === 0) return 0;
    let s = 0;
    let cursor = new Date(`${today}T00:00:00`);
    for (const entry of positives) {
      const cursorStr = cursor.toISOString().slice(0, 10);
      if (entry.date === cursorStr) {
        s++;
        cursor.setDate(cursor.getDate() - 1);
      } else if (entry.date < cursorStr) {
        break;
      }
    }
    return s;
  })();

  const handleAnswer = async (showedUp: boolean) => {
    if (!user?.id || !goalId) return;
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await recordCheckin(user.id, goalId, showedUp);
    setResponse(showedUp);
    setAnswered(true);
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
    fontSize: 28,
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
    fontSize: 32,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  responseSubtitle: { fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm },
});
