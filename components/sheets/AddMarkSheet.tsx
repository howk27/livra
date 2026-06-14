import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PillButton } from '../ui/PillButton';
import { SectionLabel } from '../ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../state/goalsSlice';
import { logger } from '../../lib/utils/logger';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
const DURATION = 300;

interface Category {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
}

const CATEGORIES: Category[] = [
  { key: 'sleep',    label: 'Sleep',    icon: 'moon',       accent: '#6B8FA6' },
  { key: 'workout',  label: 'Workout',  icon: 'activity',   accent: '#A0614A' },
  { key: 'water',    label: 'Water',    icon: 'droplet',    accent: '#4A8C7A' },
  { key: 'planning', label: 'Planning', icon: 'calendar',   accent: '#8C7A3A' },
  { key: 'reading',  label: 'Reading',  icon: 'book-open',  accent: '#7A4A8C' },
  { key: 'work',     label: 'Work',     icon: 'briefcase',  accent: '#4A6A8C' },
  { key: 'custom',   label: 'Custom',   icon: 'circle',     accent: '#6B7A6B' },
];

function applyOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return hex + alpha;
}

interface AddMarkSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddMarkSheet({ visible, onClose }: AddMarkSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = themedColors(useEffectiveTheme());
  const { user } = useAuth();
  const { createCounter } = useCounters();
  const activeGoal = useGoalsStore((s) => s.goals.find((g) => g.status === 'active'));
  const linkMarkToGoal = useGoalsStore((s) => s.linkMarkToGoal);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('custom');
  const [target, setTarget] = useState(1);
  const [saving, setSaving] = useState(false);

  const translateY = useSharedValue(SHEET_HEIGHT);
  const overlayOpacity = useSharedValue(0);

  const open = useCallback(() => {
    translateY.value = withTiming(0, { duration: DURATION });
    overlayOpacity.value = withTiming(1, { duration: DURATION });
  }, [translateY, overlayOpacity]);

  const close = useCallback(() => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: DURATION });
    overlayOpacity.value = withTiming(0, { duration: DURATION }, () => {
      runOnJS(onClose)();
    });
  }, [translateY, overlayOpacity, onClose]);

  React.useEffect(() => {
    if (visible) {
      open();
    } else {
      translateY.value = withTiming(SHEET_HEIGHT, { duration: DURATION });
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

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for your mark.');
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      const selectedCat = CATEGORIES.find(c => c.key === category);
      const goalId = activeGoal?.id ?? null;
      const savedMark = await createCounter({
        name: name.trim(),
        user_id: user.id,
        dailyTarget: target > 0 ? target : null,
        color: selectedCat?.accent,
        ...(goalId ? { goal_id: goalId } : {}),
      } as any);
      if (goalId && savedMark?.id) {
        linkMarkToGoal(goalId, savedMark.id).catch(() => {});
      }
      setName('');
      setCategory('custom');
      setTarget(1);
      close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create mark.';
      if (msg.includes('FREE_COUNTER_LIMIT_REACHED')) {
        // Soft, per-goal upsell — never a wall on the core loop.
        Alert.alert(
          "That's 3 marks on this goal",
          'Three focused marks per goal keeps things doable. Livra+ lets you add more when you want to.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Livra+', onPress: () => router.push('/paywall') },
          ]
        );
      } else {
        Alert.alert('Error', msg);
      }
      logger.error('AddMarkSheet createMark failed:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!visible && translateY.value >= SHEET_HEIGHT) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[styles.overlay, { backgroundColor: tc.inkDark }, overlayStyle]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { backgroundColor: tc.surface, paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}>
        <View style={[styles.handle, { backgroundColor: tc.borderMid }]} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.sheetTitle, { color: tc.inkDark }]}>What will you do every day?</Text>
            <Text style={[styles.sheetSubtitle, { color: tc.inkMuted }]}>Pick something small enough to start today.</Text>

            {/* Mark Name */}
            <View style={styles.fieldBlock}>
              <SectionLabel>OR CREATE YOUR OWN</SectionLabel>
              <TextInput
                style={[styles.input, { backgroundColor: tc.surfaceAlt, color: tc.inkDark, borderColor: tc.borderLight }]}
                value={name}
                onChangeText={setName}
                placeholder="Name your mark..."
                placeholderTextColor={tc.inkMuted}
                returnKeyType="done"
              />
              {name.trim().length > 0 && (
                <Text style={[styles.identityPreview, { color: tc.inkMuted }]}>
                  I am someone who {name.trim().toLowerCase()}.
                </Text>
              )}
            </View>

            {/* Category */}
            <View style={styles.fieldBlock}>
              <SectionLabel>POPULAR MARKS</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
                contentContainerStyle={styles.categoryRow}
              >
                {CATEGORIES.map(cat => {
                  const isSelected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.categoryPill,
                        isSelected
                          ? { backgroundColor: `${tc.forest}18`, borderWidth: 1.5, borderColor: tc.forest }
                          : { backgroundColor: tc.surfaceAlt, borderWidth: 1.5, borderColor: 'transparent' },
                      ]}
                      onPress={() => setCategory(cat.key)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={cat.icon}
                        size={14}
                        color={isSelected ? tc.inkInverse : tc.inkMid}
                      />
                      <Text
                        style={[
                          styles.categoryLabel,
                          { color: isSelected ? tc.inkInverse : tc.inkMid },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Daily Target */}
            <View style={styles.fieldBlock}>
              <SectionLabel>DAILY TARGET</SectionLabel>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: tc.surfaceAlt }]}
                  onPress={() => setTarget(t => Math.max(1, t - 1))}
                  activeOpacity={0.7}
                >
                  <Feather name="minus" size={16} color={tc.inkMid} />
                </TouchableOpacity>
                <Text style={[styles.stepNumber, { color: tc.inkDark }]}>{target}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: tc.surfaceAlt }]}
                  onPress={() => setTarget(t => t + 1)}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={16} color={tc.inkMid} />
                </TouchableOpacity>
                <Text style={[styles.stepLabel, { color: tc.inkMuted }]}>times per day</Text>
              </View>
            </View>

            <PillButton
              label={saving ? 'Adding…' : 'Add this mark'}
              onPress={handleSave}
              disabled={saving || !name.trim()}
              style={[styles.cta, { opacity: (!name.trim() && !saving) ? 0.4 : 1 }]}
            />
          </ScrollView>
        </KeyboardAvoidingView>
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
    height: SHEET_HEIGHT,
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
    fontSize: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    lineHeight: 30,
  },
  sheetSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  fieldBlock: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.sans,
    fontSize: 15,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  categoryScroll: {
    marginTop: spacing.xs,
  },
  categoryRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  categoryLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  identityPreview: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    width: 48,
    textAlign: 'center',
  },
  stepLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginLeft: spacing.sm,
  },
  cta: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    height: 52,
  },
});
