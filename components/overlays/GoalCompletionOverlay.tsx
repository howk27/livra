import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgLogo } from '../ui/SvgLogo';
import { PillButton } from '../ui/PillButton';
import { GoalCompletionShareCard } from '../GoalCompletionShareCard';
import { SharePreviewModal } from '../SharePreviewModal';
import { fonts, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';
import { useShareCardStore } from '../../state/shareCardSlice';
import { useXPStore } from '../../state/xpSlice';
import { getLevelForXP, LEVEL_TITLES } from '../../lib/xpEngine';
import { checkProStatus } from '../../lib/iap/iap';
import { canCustomizeShareCard } from '../../lib/gating';
import { generateShareCard } from '../../lib/sharing/generateShareCard';
import { logger } from '../../lib/utils/logger';
import { formatBankedMomentum } from '../../lib/momentumPresenter';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;

function AnimatedElement({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 200 }));
  }, [delay, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function GoalCompletionOverlay() {
  const insets = useSafeAreaInsets();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { completedGoal, show, hideCompletion } = useGoalCompletionStore();
  const router = useRouter();
  const shareCardRef = useRef<View>(null) as React.RefObject<View>;
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [canCustomize, setCanCustomize] = useState(false);
  const [saveLabel, setSaveLabel] = useState('Save to Photos');
  const style = useShareCardStore((s) => s.style);
  const updateStyle = useShareCardStore((s) => s.updateStyle);
  const loadShareCardStyle = useShareCardStore((s) => s.loadShareCardStyle);
  const xp = useXPStore((s) => s.totalXP ?? 0);
  const levelTitle = LEVEL_TITLES[getLevelForXP(xp) - 1] ?? 'Livra';

  useEffect(() => {
    loadShareCardStyle();
  }, [loadShareCardStyle]);

  const completedDate = (completedGoal?.completed_at ?? new Date().toISOString()).slice(0, 10);
  const daysTaken =
    completedGoal?.created_at && completedGoal?.completed_at
      ? Math.max(
          1,
          Math.round(
            (new Date(completedGoal.completed_at).getTime() -
              new Date(completedGoal.created_at).getTime()) /
              86_400_000,
          ),
        )
      : 1;
  const targetDateLabel: string | undefined =
    completedGoal?.target_date && completedGoal?.completed_at
      ? (() => {
          const diff = Math.round(
            (new Date(completedGoal.completed_at).getTime() -
              new Date(completedGoal.target_date).getTime()) /
              86_400_000,
          );
          if (diff < 0) return `Finished ${Math.abs(diff)} days early`;
          if (diff > 0) return `Finished ${diff} days late`;
          return 'Finished right on time';
        })()
      : undefined;

  const handleSharePress = useCallback(async () => {
    const { effectiveUnlocked } = await checkProStatus();
    setCanCustomize(canCustomizeShareCard(effectiveUnlocked));
    setShareModalVisible(true);
  }, []);

  const handleShareImage = useCallback(async () => {
    try {
      const uri = await generateShareCard(shareCardRef);
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your goal' });
    } catch (e) {
      logger.debug('[Share] failed', e);
    }
  }, []);

  const handleSaveImage = useCallback(async () => {
    try {
      // Lazy import: the native module doesn't exist on web and would crash at startup.
      const MediaLibrary = await import('expo-media-library');
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaveLabel('Failed, try again');
        return;
      }
      const uri = await generateShareCard(shareCardRef);
      await MediaLibrary.saveToLibraryAsync(uri);
      setSaveLabel('Saved');
    } catch {
      setSaveLabel('Failed, try again');
    }
  }, []);

  const bgOpacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dividerWidth = useSharedValue(0);

  useEffect(() => {
    if (show) {
      bgOpacity.value = withTiming(1, { duration: 200 });
      dividerWidth.value = withDelay(700, withTiming(1, { duration: 600 }));
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } else {
      bgOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [show, bgOpacity, dividerWidth]);

  const bankedLine = completedGoal ? formatBankedMomentum(completedGoal.banked_momentum_days) : null;

  const dismiss = useCallback(() => {
    translateY.value = withSpring(SCREEN_HEIGHT, { damping: 20, stiffness: 200 }, () => {
      runOnJS(hideCompletion)();
    });
  }, [translateY, hideCompletion]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    width: `${dividerWidth.value * 100}%` as any,
  }));

  if (!show || !completedGoal) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.bg, { backgroundColor: c.linen }, bgStyle]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.container,
            { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
            containerStyle,
          ]}
        >
          <AnimatedElement delay={400}>
            <SvgLogo color={theme === 'dark' ? c.inkDark : c.forest} width={52} height={26} />
          </AnimatedElement>

          <AnimatedElement delay={550}>
            <Text style={[styles.goalTitle, { color: c.inkDark }]}>{completedGoal.title}</Text>
          </AnimatedElement>

          <AnimatedElement delay={700}>
            <Animated.View style={[styles.divider, { backgroundColor: c.borderMid }, dividerStyle]} />
          </AnimatedElement>

          <AnimatedElement delay={850}>
            <Text style={[styles.completionCopy, { color: c.inkMid }]}>Done. That one's yours forever.</Text>
          </AnimatedElement>

          {bankedLine && (
            <AnimatedElement delay={925}>
              <Text style={[styles.bankedLine, { color: c.inkMuted }]}>{bankedLine}</Text>
            </AnimatedElement>
          )}

          <AnimatedElement delay={1200}>
            <View style={styles.actions}>
              <PillButton
                label="Continue"
                onPress={dismiss}
                style={styles.continueBtn}
              />
              <TouchableOpacity onPress={handleSharePress}>
                <Text style={[styles.shareText, { color: c.inkMuted }]}>Share your win</Text>
              </TouchableOpacity>
            </View>
          </AnimatedElement>
        </Animated.View>
      </GestureDetector>

      {completedGoal && (
        <View
          style={{ position: 'absolute', left: -10000, top: 0, opacity: 0 }}
          pointerEvents="none"
        >
          <GoalCompletionShareCard
            forwardRef={shareCardRef}
            goalTitle={completedGoal.title}
            completedDate={completedDate}
            levelTitle={levelTitle}
            daysTaken={daysTaken}
            targetDateLabel={targetDateLabel}
            bankedMomentumDays={completedGoal.banked_momentum_days}
            style={style}
          />
        </View>
      )}

      <SharePreviewModal
        visible={shareModalVisible}
        goalTitle={completedGoal?.title ?? ''}
        canCustomize={canCustomize}
        style={style}
        onStyleChange={(patch) => updateStyle(patch)}
        onRequestUpgrade={() => {
          setShareModalVisible(false);
          router.push('/paywall');
        }}
        onShare={handleShareImage}
        onSave={handleSaveImage}
        saveLabel={saveLabel}
        cardProps={{
          goalTitle: completedGoal?.title ?? '',
          completedDate,
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bg: {
    zIndex: 10000,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  goalTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize['3xl'],
    lineHeight: 38,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  divider: {
    height: 1,
    alignSelf: 'center',
    marginVertical: spacing.xl,
  },
  completionCopy: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize[22],
    textAlign: 'center',
  },
  bankedLine: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.xxl,
    width: '100%',
    alignItems: 'center',
    gap: spacing.md,
  },
  continueBtn: {
    width: '100%',
    height: 52,
  },
  shareText: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },
});
