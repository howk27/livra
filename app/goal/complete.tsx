import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { themedColors, spacing, fontSize, fontWeight, borderRadius, fonts } from '../../theme/tokens';
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
import { SvgLogo } from '../../components/ui/SvgLogo';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { PillButton } from '../../components/ui/PillButton';

export default function GoalCompleteScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
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

  const nextGoal = useGoalsStore((s) =>
    s.goals.find((g) => g.status === 'active' && g.id !== goalId) ?? null
  );

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

  // Staggered entrance animations
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const copyOpacity = useSharedValue(0);
  const dividerOpacity = useSharedValue(0);
  const nextOpacity = useSharedValue(0);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: copyOpacity.value }));
  const dividerStyle = useAnimatedStyle(() => ({ opacity: dividerOpacity.value }));
  const nextStyle = useAnimatedStyle(() => ({ opacity: nextOpacity.value }));

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const d = 200;
    logoOpacity.value = withTiming(1, { duration: d });
    titleOpacity.value = withDelay(d, withTiming(1, { duration: d }));
    copyOpacity.value = withDelay(d * 2, withTiming(1, { duration: d }));
    dividerOpacity.value = withDelay(d * 3, withTiming(1, { duration: d }));
    nextOpacity.value = withDelay(d * 4, withTiming(1, { duration: d }));
  }, [logoOpacity, titleOpacity, copyOpacity, dividerOpacity, nextOpacity]);

  const handleNext = useCallback(() => {
    const nextActive = useGoalsStore.getState().getActiveGoal();
    if (nextActive) {
      router.replace('/(tabs)/focus' as any);
    } else {
      router.replace('/goal/queue');
    }
  }, [router]);

  const handleReflectSubmit = useCallback(() => {
    router.replace('/(tabs)/focus' as any);
  }, [router]);

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
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.reflectPrompt}>
            What made this one possible?
          </Text>
          <TextInput
            style={[
              styles.reflectInput,
              {
                color: c.inkDark,
                backgroundColor: c.surface,
                borderColor: c.borderLight,
              },
            ]}
            placeholder="Write anything — or skip."
            placeholderTextColor={c.inkMuted}
            value={reflection}
            onChangeText={setReflection}
            multiline
            numberOfLines={4}
            autoFocus
          />
          <PillButton label="Done" onPress={handleReflectSubmit} fullWidth />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <SvgLogo color={theme === 'dark' ? c.inkDark : c.forest} width={56} height={28} />
        </Animated.View>

        {/* Goal title */}
        <Animated.Text style={[styles.goalTitle, titleStyle]}>
          {goalTitle}
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, copyStyle]}>
          {"Done. That one's yours forever."}
        </Animated.Text>

        {/* Divider */}
        <Animated.View style={[styles.divider, dividerStyle]} />

        {/* What's Next */}
        <Animated.View style={[styles.nextBlock, nextStyle]}>
          <SectionLabel color={c.inkMuted} style={styles.nextLabel}>
            {"WHAT'S NEXT?"}
          </SectionLabel>
          {nextGoal ? (
            <Text style={styles.nextTitle}>{nextGoal.title}</Text>
          ) : (
            <Text style={styles.nextTitle}>Your queue is clear.</Text>
          )}
          <View style={styles.actions}>
            <PillButton label="Continue" onPress={handleNext} fullWidth />
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleSharePress}
              disabled={shareLoading}
              accessibilityRole="button"
            >
              <Text style={styles.shareBtnText}>
                {shareLoading ? 'Preparing…' : 'Share this moment'}
              </Text>
            </TouchableOpacity>
          </View>
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

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.linen,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoWrap: {
    marginBottom: spacing.xl,
  },
  goalTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize['3xl'],
    lineHeight: 38,
    color: c.inkDark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  tagline: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize[22],
    color: c.inkMid,
    textAlign: 'center',
  },
  divider: {
    width: 48,
    height: 1,
    backgroundColor: c.borderLight,
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  nextBlock: {
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.xl,
  },
  nextLabel: {
    textAlign: 'center',
  },
  nextTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[17],
    color: c.inkDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  shareBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: c.inkMuted,
  },
  reflectPrompt: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize.lg,
    color: c.inkDark,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  reflectInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: spacing.lg,
  },
  offScreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
  });
}
