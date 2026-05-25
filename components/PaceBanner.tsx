import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO } from 'date-fns';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';

type Props = {
  isBehind: boolean;
  projectedMiss: number;
  goalTitle: string;
  goalId: string;
  suggestedDate: string | null;
};

function dismissedKey(goalId: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  return `@livra_pace_banner_dismissed:${goalId}:${today}`;
}

export function PaceBanner({
  isBehind,
  projectedMiss,
  goalTitle,
  goalId,
  suggestedDate,
}: Props) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);

  const [dismissed, setDismissed] = useState(true); // hidden until async check
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(
    suggestedDate ? parseISO(suggestedDate) : new Date(),
  );

  useEffect(() => {
    if (!isBehind || !goalId) {
      setDismissed(true);
      return;
    }
    AsyncStorage.getItem(dismissedKey(goalId)).then(val => {
      setDismissed(val === '1');
    });
  }, [isBehind, goalId]);

  if (!isBehind || dismissed) return null;

  const handleDismiss = async () => {
    await AsyncStorage.setItem(dismissedKey(goalId), '1');
    setDismissed(true);
  };

  const handleAccept = async () => {
    if (!suggestedDate) return;
    await updateGoalTargetDate(goalId, suggestedDate);
    setModalVisible(false);
    setDismissed(true);
  };

  const handlePickDate = async (date: Date) => {
    const iso = format(date, 'yyyy-MM-dd');
    await updateGoalTargetDate(goalId, iso);
    setShowDatePicker(false);
    setModalVisible(false);
    setDismissed(true);
  };

  return (
    <>
      <View style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerText, { color: themeColors.text }]}>
            At this pace,{' '}
            <Text style={{ fontWeight: fontWeight.semibold }}>{goalTitle}</Text>
            {' '}finishes about{' '}
            <Text style={{ fontWeight: fontWeight.semibold }}>{projectedMiss} days late</Text>
            . Still fixable.
          </Text>
          <TouchableOpacity
            style={[styles.recalibrateBtn, { backgroundColor: themeColors.accent.primary }]}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.recalibrateBtnText}>Recalibrate</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.dismiss, { color: themeColors.textSecondary }]}>×</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalVisible(false); setShowDatePicker(false); }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setModalVisible(false); setShowDatePicker(false); }}
        >
          <TouchableOpacity
            style={[styles.sheet, { backgroundColor: themeColors.surface }]}
            activeOpacity={1}
          >
            <Text style={[styles.sheetTitle, { color: themeColors.textSecondary }]}>
              Suggested target
            </Text>
            <Text style={[styles.sheetDate, { color: themeColors.text }]}>
              {suggestedDate
                ? format(parseISO(suggestedDate), 'MMMM d, yyyy')
                : 'No suggestion available'}
            </Text>

            {!showDatePicker && (
              <>
                {suggestedDate && (
                  <TouchableOpacity
                    style={[styles.acceptBtn, { backgroundColor: themeColors.accent.primary }]}
                    onPress={handleAccept}
                  >
                    <Text style={styles.acceptBtnText}>Yes, update it</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <Text style={[styles.pickLink, { color: themeColors.textSecondary }]}>
                    Pick a different date
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {showDatePicker && Platform.OS === 'ios' && (
              <>
                <DateTimePicker
                  value={pickedDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, date) => { if (date) setPickedDate(date); }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: themeColors.accent.primary }]}
                  onPress={() => handlePickDate(pickedDate)}
                >
                  <Text style={styles.acceptBtnText}>Set this date</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  bannerContent: { flex: 1, gap: spacing.sm },
  bannerText: { fontSize: fontSize.sm, lineHeight: 20 },
  recalibrateBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  recalibrateBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  dismiss: { fontSize: 22, lineHeight: 24 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: 1 },
  sheetDate: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  acceptBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  pickLink: { fontSize: fontSize.sm, textAlign: 'center', textDecorationLine: 'underline' },
});
