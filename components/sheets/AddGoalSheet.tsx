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
  Switch,
  Dimensions,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { PillButton } from '../ui/PillButton';
import { SectionLabel } from '../ui/SectionLabel';
import { MarkRow } from '../ui/MarkRow';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { logger } from '../../lib/utils/logger';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
const DURATION = 300;

interface AddGoalSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddGoalSheet({ visible, onClose }: AddGoalSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = themedColors(useEffectiveTheme());
  const { user } = useAuth();
  const { isProUnlocked } = useIapSubscriptions();
  const createGoal = useGoalsStore(s => s.createGoal);
  const linkMarkToGoal = useGoalsStore(s => s.linkMarkToGoal);
  const marks = useMarksStore(s => s.marks.filter(m => !m.deleted_at));

  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [targetCount, setTargetCount] = useState(0);
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  });
  const [linkedMarkIds, setLinkedMarkIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const deadlineHeight = useSharedValue(0);

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

  React.useEffect(() => {
    deadlineHeight.value = withSpring(deadlineEnabled ? 1 : 0, { damping: 15, stiffness: 200 });
  }, [deadlineEnabled, deadlineHeight]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value * 0.5,
  }));

  const deadlineStyle = useAnimatedStyle(() => ({
    overflow: 'hidden',
    maxHeight: deadlineHeight.value * 220,
    opacity: deadlineHeight.value,
  }));

  const toggleMark = (id: string) => {
    setLinkedMarkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Enter a title for your goal.');
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      const goal = await createGoal({
        title: title.trim(),
        description: why.trim() || undefined,
        target_mark_count: targetCount > 0 ? targetCount : undefined,
        target_date: deadlineEnabled ? deadline.toISOString().split('T')[0] : undefined,
        userId: user.id,
        isPro: isProUnlocked,
      });
      for (const markId of linkedMarkIds) {
        await linkMarkToGoal(goal.id, markId).catch(e =>
          logger.error('linkMarkToGoal failed:', e),
        );
      }
      setTitle('');
      setWhy('');
      setTargetCount(0);
      setDeadlineEnabled(false);
      setLinkedMarkIds(new Set());
      close();
    } catch (err: unknown) {
      if (err instanceof GoalLimitError) {
        // Soft cap surface — never a hard wall.
        Alert.alert(
          'Two goals at a time',
          'Free keeps you to 2 active goals so you can actually finish them. Livra+ opens an unlimited queue.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Livra+', onPress: () => router.push('/paywall') },
          ]
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Could not create goal.';
        Alert.alert('Error', msg);
      }
      logger.error('AddGoalSheet createGoal failed:', err);
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
            <Text style={[styles.sheetTitle, { color: tc.inkDark }]}>New Goal</Text>
            <Text style={[styles.sheetSubtitle, { color: tc.inkMuted }]}>What does finishing this make possible?</Text>

            {/* Goal Name */}
            <View style={styles.fieldBlock}>
              <SectionLabel>GOAL NAME</SectionLabel>
              <TextInput
                style={[styles.input, styles.goalNameInput, { backgroundColor: tc.surfaceAlt, color: tc.inkDark, borderColor: tc.borderLight }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Run a marathon..."
                placeholderTextColor={tc.inkMuted}
                returnKeyType="next"
              />
            </View>

            {/* Why */}
            <View style={styles.fieldBlock}>
              <SectionLabel>YOUR WHY</SectionLabel>
              <TextInput
                style={[styles.input, styles.multiInput, { backgroundColor: tc.surfaceAlt, color: tc.inkDark, borderColor: tc.borderLight }]}
                value={why}
                onChangeText={setWhy}
                placeholder="What will finishing this change?"
                placeholderTextColor={tc.inkMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Zone divider */}
            <View style={[styles.zoneDivider, { backgroundColor: tc.borderLight }]} />
            <SectionLabel style={styles.zoneMechanicsLabel}>HOW IT WORKS</SectionLabel>

            {/* Target Count */}
            <View style={styles.fieldBlock}>
              <SectionLabel>COMPLETION TARGET</SectionLabel>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: tc.surfaceAlt }]}
                  onPress={() => setTargetCount(t => Math.max(0, t - 1))}
                  activeOpacity={0.7}
                >
                  <Feather name="minus" size={16} color={tc.inkMid} />
                </TouchableOpacity>
                <Text style={[styles.stepNumber, { color: tc.inkDark }]}>{targetCount}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, { backgroundColor: tc.surfaceAlt }]}
                  onPress={() => setTargetCount(t => t + 1)}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={16} color={tc.inkMid} />
                </TouchableOpacity>
                <Text style={[styles.stepLabel, { color: tc.inkMuted }]}>total marks to complete</Text>
              </View>
            </View>

            {/* Deadline */}
            <View style={styles.fieldBlock}>
              <SectionLabel>DEADLINE</SectionLabel>
              <View style={styles.deadlineToggleRow}>
                <Switch
                  value={deadlineEnabled}
                  onValueChange={setDeadlineEnabled}
                  trackColor={{ false: tc.borderMid, true: tc.forest }}
                  thumbColor={tc.inkInverse}
                />
                <Text style={[styles.deadlineLabel, { color: tc.inkDark }]}>Set a deadline</Text>
              </View>
              <Animated.View style={deadlineStyle}>
                <DateTimePicker
                  value={deadline}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, d) => d && setDeadline(d)}
                />
              </Animated.View>
            </View>

            {/* Link Marks */}
            {marks.length > 0 && (
              <View style={styles.fieldBlock}>
                <SectionLabel>WHICH MARKS FEED THIS?</SectionLabel>
                <Text style={[styles.linkSubtitle, { color: tc.inkMuted }]}>Which marks feed this goal?</Text>
                {marks.map((mark, idx) => {
                  const linked = linkedMarkIds.has(mark.id);
                  return (
                    <TouchableOpacity
                      key={mark.id}
                      onPress={() => toggleMark(mark.id)}
                      activeOpacity={0.7}
                      style={[
                        styles.markLinkRow,
                        linked && [styles.markLinkRowLinked, { borderLeftColor: tc.forest }],
                        idx < marks.length - 1 && [styles.markLinkBorder, { borderBottomColor: tc.borderLight }],
                      ]}
                    >
                      <MarkRow
                        title={mark.name}
                        isLast
                        loggedToday={linked}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <PillButton
              label={saving ? 'Adding…' : 'Add to queue'}
              onPress={handleSave}
              disabled={saving || !title.trim()}
              style={[styles.cta, { opacity: (!title.trim() && !saving) ? 0.4 : 1 }]}
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
    fontSize: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    lineHeight: 34,
  },
  sheetSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    fontStyle: 'italic',
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
  goalNameInput: {
    height: 56,
    fontSize: 17,
    fontFamily: fonts.sansMedium,
  },
  multiInput: {
    height: 80,
    paddingTop: spacing.sm,
  },
  zoneDivider: {
    height: 1,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xl,
  },
  zoneMechanicsLabel: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
    flex: 1,
  },
  deadlineToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  deadlineLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  linkSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  markLinkRow: {
    paddingLeft: spacing.xs,
  },
  markLinkRowLinked: {
    borderLeftWidth: 3,
  },
  markLinkBorder: {
    borderBottomWidth: 1,
  },
  cta: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    height: 52,
  },
});
