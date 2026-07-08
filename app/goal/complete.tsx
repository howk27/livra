import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { themedColors, spacing, fontSize, fontWeight, borderRadius, fonts } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useXPStore } from '../../state/xpSlice';
import { getLevelForXP, LEVEL_TITLES } from '../../lib/xpEngine';
import { useGoalsStore } from '../../state/goalsSlice';
import { resolveCompletionState } from '../../lib/completionState';
import { getAppDate } from '../../lib/appDate';
import { checkProStatus } from '../../lib/iap/iap';
import { canCustomizeShareCard } from '../../lib/gating';
import { logger } from '../../lib/utils/logger';
import { generateShareCard } from '../../lib/sharing/generateShareCard';
import { useShareCardStore } from '../../state/shareCardSlice';
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
  const [canCustomize, setCanCustomize] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Save to Photos');

  // Persisted share card style from Zustand slice
  const style = useShareCardStore((s) => s.style);
  const updateStyle = useShareCardStore((s) => s.updateStyle);
  const loadShareCardStyle = useShareCardStore((s) => s.loadShareCardStyle);

  useEffect(() => {
    loadShareCardStyle();
  }, [loadShareCardStyle]);

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

  const closure = resolveCompletionState(goals);
  const getCompletedGoals = useGoalsStore((s) => s.getCompletedGoals);
  const completedGoals = useMemo(() => getCompletedGoals(), [getCompletedGoals, goals]);
  const completedCount = completedGoals.length;
  const marksLogged = useMemo(
    () => completedGoals.reduce((sum, g) => sum + (g.current_mark_count ?? 0), 0),
    [completedGoals],
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
    const hasActive = useGoalsStore.getState().getActiveGoals().length > 0;
    router.replace(hasActive ? ('/(tabs)/focus' as any) : ('/(tabs)/goals' as any));
  }, [router]);

  const handleReflectSubmit = useCallback(() => {
    router.replace('/(tabs)/focus' as any);
  }, [router]);

  const handleSharePress = useCallback(async () => {
    const { effectiveUnlocked } = await checkProStatus();
    setCanCustomize(canCustomizeShareCard(effectiveUnlocked));
    setShareModalVisible(true);
  }, []);

  const handleShareImage = useCallback(async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    try {
      const uri = await generateShareCard(shareCardRef);
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your goal' });
    } catch (e) { logger.debug('[Share] failed', e); }
  }, []);

  const handleSaveImage = useCallback(async () => {
    try {
      // Lazy import: the native module doesn't exist on web and would crash at startup.
      const MediaLibrary = await import('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { setSaveLabel('Failed, try again'); return; }
      const uri = await generateShareCard(shareCardRef);
      await MediaLibrary.saveToLibraryAsync(uri);
      setSaveLabel('Saved');
    } catch { setSaveLabel('Failed, try again'); }
  }, []);

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
            placeholder="Write anything, or skip."
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
            {closure === 'all-complete' ? 'WHAT YOU BUILT' : "WHAT'S NEXT?"}
          </SectionLabel>
          {closure === 'all-complete' ? (
            <View>
              <Text style={styles.nextTitle}>You finished everything you set out to do.</Text>
              <Text style={[styles.closureStat, { color: c.inkMuted }]}>
                {`${completedCount} ${completedCount === 1 ? 'goal' : 'goals'} complete. ${marksLogged} marks logged.`}
              </Text>
            </View>
          ) : nextGoal ? (
            <Text style={styles.nextTitle}>{nextGoal.title}</Text>
          ) : null}
          <View style={styles.actions}>
            <PillButton
              label={closure === 'all-complete' ? 'Start your next goal' : 'Continue'}
              onPress={handleNext}
              fullWidth
            />
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleSharePress}
              accessibilityRole="button"
            >
              <Text style={styles.shareBtnText}>Share this moment</Text>
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
          bankedMomentumDays={completedGoal?.banked_momentum_days}
          style={style}
        />
      </View>

      <SharePreviewModal
        visible={shareModalVisible}
        goalTitle={goalTitle ?? ''}
        canCustomize={canCustomize}
        style={style}
        onStyleChange={(patch) => updateStyle(patch)}
        onRequestUpgrade={() => router.push('/paywall')}
        onShare={handleShareImage}
        onSave={handleSaveImage}
        saveLabel={saveLabel}
        cardProps={{
          goalTitle: goalTitle ?? '',
          completedDate: getAppDate().toISOString().slice(0, 10),
          levelTitle,
          daysTaken,
          targetDateLabel,
          bankedMomentumDays: completedGoal?.banked_momentum_days,
        }}
        onClose={() => {
          setShareModalVisible(false);
          setSaveLabel('Save to Photos');
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
  closureStat: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
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
