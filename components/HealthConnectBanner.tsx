import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { detectHealthKitType } from '../lib/health/autoSuggest';
import { checkProStatus } from '../lib/iap/iap';

const BANNER_DISMISSED_PREFIX = '@livra_health_banner_dismissed:';

type Props = {
  markId: string;
  markName: string;
  alreadyConnected: boolean;
};

export function HealthConnectBanner({ markId, markName, alreadyConnected }: Props) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const detectedType = detectHealthKitType(markName);

  useEffect(() => {
    if (!detectedType || alreadyConnected) return;

    const key = `${BANNER_DISMISSED_PREFIX}${markId}`;
    AsyncStorage.getItem(key).then(val => {
      if (val === null) setVisible(true);
    });
  }, [detectedType, alreadyConnected, markId]);

  const dismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(`${BANNER_DISMISSED_PREFIX}${markId}`, '1');
  };

  const handleConnect = async () => {
    await dismiss();
    const status = await checkProStatus();
    if (!status.effectiveUnlocked) {
      router.push('/paywall');
    } else {
      router.push(`/mark/${markId}` as any);
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Text style={[styles.text, { color: themeColors.text }]}>
        Connect {markName} to Apple Health to power your weekly reflection.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => void handleConnect()}>
          <Text style={[styles.connectBtn, { color: themeColors.primary }]}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void dismiss()}>
          <Text style={[styles.dismissBtn, { color: themeColors.textSecondary }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  text: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  connectBtn: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  dismissBtn: {
    fontSize: fontSize.sm,
  },
});
