import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useXPStore } from '../../state/xpSlice';
import { getLevelForXP, LEVEL_TITLES } from '../../lib/xpEngine';
import { useGoalsStore } from '../../state/goalsSlice';
import { getAppDate } from '../../lib/appDate';
import { checkProStatus } from '../../lib/iap/iap';
import { logger } from '../../lib/utils/logger';
import { generateShareCard } from '../../lib/sharing/generateShareCard';
import { GoalCompletionShareCard } from '../../components/GoalCompletionShareCard';
import { SharePreviewModal } from '../../components/SharePreviewModal';

export default function GoalCompleteScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle, goalId } = useLocalSearchParams<{ goalTitle: string; goalId?: string }>();

  const [phase, setPhase] = useState<'moment' | 'reflect'>('moment');
  const [reflection, setReflection] = useState('');

  // Share flow state
  const shareCardRef = useRef<View>(null) as React.RefObject<View>;
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareImageUri, setShareImageUri] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Derive level title
  const xp = useXPStore((s) => s.totalXP ?? 0);
  const level = getLevelForXP(xp);
  const levelTitle = LEVEL_TITLES[level - 1] ?? 'Livra';

  // Derive days taken and targetDateLabel
  const goals = useGoalsStore((s) => s.goals);
  const completedGoal = goalId ? goals.find((g) => g.id === goalId) : undefined;

  const daysTaken: number = (() => {
    if (!completedGoal?.created_at) return 1;
    const start = new Date(completedGoal.created_at);
    const appDate = getAppDate();
    const end = new Date(appDate.getFullYear(), appDate.getMonth(), appDate.getDate());
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const targetDateLabel: string | undefined = (() => {
    if (!completedGoal?.target_date) return undefined;
    const target = new Date(completedGoal.target_date);
    const appDate = getAppDate();
    const today = new Date(appDate.getFullYear(), appDate.getMonth(), appDate.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Finished ${Math.abs(diffDays)} days early`;
    if (diffDays > 0) return `Finished ${diffDays} days late`;
    return 'Finished right on time';
  })();

  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    scale.value = withSpring(1, { damping: 14, stiffness: 90 });
    opacity.value = withTiming(1, { duration: 500 });
    subtitleOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
  }, [scale, opacity, subtitleOpacity]);

  const handleNext = () => {
    router.replace('/(tabs)/home');
  };

  const handleReflectSubmit = () => {
    router.replace('/(tabs)/home');
  };

  const handleSharePress = async () => {
    if (shareLoading) return;
    const { effectiveUnlocked: isPro } = await checkProStatus();
    if (!isPro) {
      router.push('/paywall');
      return;
    }
    setShareLoading(true);
    try {
      const uri = await generateShareCard(shareCardRef);
      setShareImageUri(uri);
      setShareModalVisible(true);
    } catch (e) {
      logger.debug('[Share] Card capture failed', e);
    } finally {
      setShareLoading(false);
    }
  };

  if (phase === 'reflect') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.reflectPrompt, { color: themeColors.textSecondary }]}>
            What made this one possible?
          </Text>
          <TextInput
            style={[
              styles.reflectInput,
              {
                color: themeColors.text,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
            placeholder="Write anything — or skip."
            placeholderTextColor={themeColors.textSecondary}
            value={reflection}
            onChangeText={setReflection}
            multiline
            numberOfLines={4}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleReflectSubmit}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.titleBlock, titleStyle]}>
          <Text style={[styles.goalName, { color: themeColors.textSecondary }]}>
            {goalTitle}
          </Text>
          <Text style={[styles.headline, { color: themeColors.text }]}>Done.</Text>
        </Animated.View>

        <Animated.Text style={[styles.tagline, { color: themeColors.textSecondary }, subtitleStyle]}>
          That one's yours forever.
        </Animated.Text>

        <Animated.View style={[styles.actions, subtitleStyle]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryBtnText}>See what's next</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: themeColors.border }]}
            onPress={() => setPhase('reflect')}
          >
            <Text style={[styles.secondaryBtnText, { color: themeColors.textSecondary }]}>
              Take a moment
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleSharePress}
            disabled={shareLoading}
            accessibilityRole="button"
          >
            <Text style={[styles.shareBtnText, { color: themeColors.textSecondary }]}>
              {shareLoading ? 'Preparing…' : 'Share this moment'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={styles.offScreen} pointerEvents="none">
        <GoalCompletionShareCard
          forwardRef={shareCardRef}
          goalTitle={goalTitle ?? ''}
          completedDate={getAppDate().toISOString().slice(0, 10)}
          levelTitle={levelTitle}
          daysTaken={daysTaken}
          targetDateLabel={targetDateLabel}
        />
      </View>

      <SharePreviewModal
        visible={shareModalVisible}
        imageUri={shareImageUri}
        goalTitle={goalTitle ?? ''}
        onClose={() => {
          setShareModalVisible(false);
          setShareImageUri(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  titleBlock: { alignItems: 'center', gap: spacing.xs },
  goalName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: { fontSize: 56, fontWeight: fontWeight.bold, lineHeight: 64 },
  tagline: { fontSize: fontSize.lg, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  secondaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: fontSize.md },
  shareBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  shareBtnText: { fontSize: fontSize.sm },
  reflectPrompt: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, textAlign: 'center' },
  reflectInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  offScreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
});
