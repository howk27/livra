import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useNotificationsMaster } from '../../hooks/useNotificationsMaster';
import { MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE } from '../../lib/notifications/notificationCopy';

export default function NotificationsScreen() {
  const c = themedColors(useEffectiveTheme());
  const { enabled, hydrated, setEnabled } = useNotificationsMaster();

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Notifications" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: c.inkMid }]}>
          Livra never sends guilt. Only momentum.
        </Text>

        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>{MASTER_NOTIF_LABEL}</Text>
              <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>{MASTER_NOTIF_SUBTITLE}</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              disabled={!hydrated}
              trackColor={{ false: c.borderMid, true: c.forest }}
              thumbColor={c.surface}
            />
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
  intro: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
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
});
