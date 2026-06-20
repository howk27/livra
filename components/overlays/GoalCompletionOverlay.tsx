import React, { useEffect, useCallback } from 'react';
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
import { ArrowRight } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgLogo } from '../ui/SvgLogo';
import { PillButton } from '../ui/PillButton';
import { SectionLabel } from '../ui/SectionLabel';
import { fonts, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';
import { useGoalsStore } from '../../state/goalsSlice';
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
  const goals = useGoalsStore((s) => s.goals);

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

  const nextGoal = React.useMemo(() => {
    if (!completedGoal) return null;
    return goals.find(
      (g) => g.status === 'active' && g.id !== completedGoal.id,
    ) ?? goals.find(
      (g) => g.status === 'queued',
    ) ?? null;
  }, [goals, completedGoal]);

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

          {nextGoal && (
            <AnimatedElement delay={1000}>
              <View style={styles.nextGoalBlock}>
                <SectionLabel color={c.inkMuted} style={styles.nextLabel}>NEXT IN LINE</SectionLabel>
                <Text style={[styles.nextTitle, { color: c.inkDark }]}>{nextGoal.title}</Text>
                <View style={styles.nextArrow}>
                  <ArrowRight size={14} color={c.inkMuted} weight="bold" />
                </View>
              </View>
            </AnimatedElement>
          )}

          <AnimatedElement delay={1200}>
            <View style={styles.actions}>
              <PillButton
                label="Continue"
                onPress={dismiss}
                style={styles.continueBtn}
              />
              <TouchableOpacity onPress={() => {}}>
                <Text style={[styles.shareText, { color: c.inkMuted }]}>Share your win</Text>
              </TouchableOpacity>
            </View>
          </AnimatedElement>
        </Animated.View>
      </GestureDetector>
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
  nextGoalBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  nextLabel: {
    textAlign: 'center',
  },
  nextTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[17],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  nextArrow: {
    alignItems: 'center',
    marginTop: spacing.xs,
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
