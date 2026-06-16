import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

export const BIOMETRIC_LOCK_KEY = 'biometric_lock_enabled';

interface ToggleRowProps {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isLast?: boolean;
  subRow?: React.ReactNode;
  subRowVisible?: boolean;
  disabled?: boolean;
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
  isLast,
  subRow,
  subRowVisible,
  disabled,
}: ToggleRowProps) {
  const c = themedColors(useEffectiveTheme());
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (subRowVisible) {
      height.value = withTiming(52, { duration: 250 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      height.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [subRowVisible, height, opacity]);

  const subRowStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));

  return (
    <View style={[styles.rowWrap, !isLast && [styles.rowBorder, { borderBottomColor: c.borderLight }]]}>
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: disabled ? c.inkMuted : c.inkDark }]}>{label}</Text>
          <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>{subtitle}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: c.borderMid, true: c.forest }}
          thumbColor={c.surface}
          disabled={disabled}
        />
      </View>
      {subRow && (
        <Animated.View style={subRowStyle}>
          {subRow}
        </Animated.View>
      )}
    </View>
  );
}

const AUTO_LOCK_OPTIONS = ['1 min', '5 min', '15 min', 'Never'];

export default function PrivacyScreen() {
  const c = themedColors(useEffectiveTheme());
  const [analytics, setAnalytics] = useState(true);
  const [crashReports, setCrashReports] = useState(true);
  const [faceId, setFaceId] = useState(false);
  const [autoLock, setAutoLock] = useState(false);
  const [autoLockOption, setAutoLockOption] = useState(1);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // On mount: check hardware + enrollment, load persisted preference
  useEffect(() => {
    const init = async () => {
      const [hasHardware, isEnrolled, stored] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        AsyncStorage.getItem(BIOMETRIC_LOCK_KEY),
      ]);
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);
      if (available) {
        setFaceId(stored === 'true');
      }
    };
    init();
  }, []);

  const handleFaceIdToggle = async (next: boolean) => {
    if (next) {
      // Turning ON: require authentication first
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable Face ID for Livra',
      });
      if (!result.success) {
        // Authentication failed or cancelled — do not change toggle
        return;
      }
      setFaceId(true);
      await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, 'true');
    } else {
      // Turning OFF: no re-authentication required
      setFaceId(false);
      await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, 'false');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Privacy" />
      <ScrollView contentContainerStyle={styles.content}>

        <SectionLabel style={styles.sectionLabel}>DATA COLLECTION</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <ToggleRow
            label="Analytics"
            subtitle="Helps improve Livra (anonymous)"
            value={analytics}
            onToggle={setAnalytics}
          />
          <ToggleRow
            label="Crash Reports"
            subtitle="Automatically send crash data"
            value={crashReports}
            onToggle={setCrashReports}
            isLast
          />
        </View>

        <SectionLabel style={styles.sectionLabel}>SECURITY</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <ToggleRow
            label="Face ID / Touch ID"
            subtitle={
              biometricAvailable
                ? 'Lock app on background'
                : 'Face ID not available on this device'
            }
            value={faceId}
            onToggle={(v) => { void handleFaceIdToggle(v); }}
            disabled={!biometricAvailable}
          />
          <ToggleRow
            label="Auto-lock"
            subtitle="Lock after inactivity"
            value={autoLock}
            onToggle={setAutoLock}
            isLast
            subRowVisible={autoLock}
            subRow={
              <View style={styles.subRow}>
                {AUTO_LOCK_OPTIONS.map((opt, i) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.optPill, { backgroundColor: autoLockOption === i ? c.forest : c.surfaceAlt }]}
                    onPress={() => setAutoLockOption(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optText, { color: autoLockOption === i ? c.inkInverse : c.inkMid }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
        </View>

        <SectionLabel style={styles.sectionLabel}>CONNECTED SERVICES</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.syncRow}>
            <View style={styles.syncLeft}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Supabase Sync</Text>
            </View>
            <View style={[styles.syncBadge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.syncBadgeText, { color: c.success }]}>Synced</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  rowWrap: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  rowSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  subRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  optPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  optText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  syncLeft: { flex: 1 },
  syncBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  syncBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
});
