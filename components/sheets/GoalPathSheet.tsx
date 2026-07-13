/**
 * GoalPathSheet — the "+ Goal" chooser (FU-6).
 *
 * A content-hugging two-row bottom sheet on AddMarkSheet's exact motion grammar
 * (300ms withTiming translateY + 0.5 overlay fade, handle bar, surface ground):
 * a quiet outlined "Build it myself" row into /goal/new, and the AI hatch row
 * into /goal/suggest. One glance, one tap; the sheet never talks pricing.
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { AIHatchButton } from '../ui/AIHatchButton';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

const SHEET_TRAVEL = 320;
const DURATION = 300;

interface GoalPathSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function GoalPathSheet({ visible, onClose }: GoalPathSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = themedColors(useEffectiveTheme());

  const translateY = useSharedValue(SHEET_TRAVEL);
  const overlayOpacity = useSharedValue(0);

  const open = useCallback(() => {
    translateY.value = withTiming(0, { duration: DURATION });
    overlayOpacity.value = withTiming(1, { duration: DURATION });
  }, [translateY, overlayOpacity]);

  const close = useCallback(() => {
    translateY.value = withTiming(SHEET_TRAVEL, { duration: DURATION });
    overlayOpacity.value = withTiming(0, { duration: DURATION }, () => {
      runOnJS(onClose)();
    });
  }, [translateY, overlayOpacity, onClose]);

  React.useEffect(() => {
    if (visible) {
      open();
    } else {
      translateY.value = withTiming(SHEET_TRAVEL, { duration: DURATION });
      overlayOpacity.value = withTiming(0, { duration: DURATION });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * 0.5,
  }));

  const handleManual = useCallback(() => {
    router.push('/goal/new');
    close();
  }, [router, close]);

  const handleSuggest = useCallback(() => {
    router.push({ pathname: '/goal/suggest' as any, params: { source: 'goals' } });
    close();
  }, [router, close]);

  if (!visible && translateY.value >= SHEET_TRAVEL) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[styles.overlay, { backgroundColor: tc.inkDark }, overlayStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: tc.surface, paddingBottom: insets.bottom + spacing.lg },
          sheetStyle,
        ]}
      >
        <View style={[styles.handle, { backgroundColor: tc.borderMid }]} />

        <Text style={[styles.sheetTitle, { color: tc.inkDark }]}>New Goal</Text>

        {/* Manual path — quiet outlined row */}
        <TouchableOpacity
          style={[styles.manualRow, { backgroundColor: tc.surfaceAlt, borderColor: tc.borderLight }]}
          onPress={handleManual}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Build it myself"
        >
          <Text style={[styles.manualLabel, { color: tc.inkDark }]}>Build it myself</Text>
          <CaretRight size={16} color={tc.inkMuted} weight="bold" />
        </TouchableOpacity>

        {/* AI path — the hatch treatment at row scale */}
        <AIHatchButton
          label="✦ Suggest a plan"
          onPress={handleSuggest}
          style={styles.suggestRow}
        />
        <Text style={[styles.caption, { color: tc.inkMuted }]}>
          Describe your goal · Livra drafts the marks
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 200,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    zIndex: 201,
    ...shadow.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize['2xl'],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    lineHeight: 34,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 52,
  },
  manualLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  suggestRow: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },
});
