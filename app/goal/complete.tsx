import React, { useEffect, useState } from 'react';
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

export default function GoalCompleteScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle } = useLocalSearchParams<{ goalTitle: string }>();

  const [phase, setPhase] = useState<'moment' | 'reflect'>('moment');
  const [reflection, setReflection] = useState('');

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
        </Animated.View>
      </View>
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
});
