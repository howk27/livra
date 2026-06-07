import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Heart, Plug } from 'phosphor-react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function IntegrationsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Integrations" />
      <ScrollView contentContainerStyle={styles.content}>

        <SectionLabel style={styles.sectionLabel}>HEALTH</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#FF2D55', 0.12) }]}>
              <Heart size={20} color="#FF2D55" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Apple Health</Text>
              <Text style={[styles.rowMeta, { color: c.inkMuted }]}>Auto-log sleep, workouts & steps</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Connect</Text>
            </View>
          </View>
        </View>

        <SectionLabel style={[styles.sectionLabel, { opacity: 0.5 }]}>COMING SOON</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface, opacity: 0.5 }]}>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#4285F4', 0.12) }]}>
              <Plug size={20} color="#4285F4" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Google Fit</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: c.borderLight }]} />
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#007AFF', 0.12) }]}>
              <Plug size={20} color="#007AFF" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Garmin</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  separator: { height: 1, marginHorizontal: spacing.lg },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: { fontFamily: fonts.sansMedium, fontSize: 12 },
});
