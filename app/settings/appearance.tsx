import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import type { ThemeMode } from '../../types';

const THEME_OPTIONS: ThemeMode[] = ['light', 'dark', 'system'];

const APP_ICONS = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'minimal', label: 'Minimal' },
];

export default function AppearanceScreen() {
  const effectiveTheme = useEffectiveTheme();
  const c = themedColors(effectiveTheme);
  const themeMode = useUIStore((s) => s.themeMode);
  const setThemeMode = useUIStore((s) => s.setThemeMode);
  const [selectedIcon, setSelectedIcon] = useState('default');

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Appearance" />
      <ScrollView contentContainerStyle={styles.content}>

        <SectionLabel style={styles.sectionLabel}>THEME</SectionLabel>
        <View style={[styles.card, styles.themeRow, { backgroundColor: c.surface }]}>
          {THEME_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.themePill,
                { backgroundColor: themeMode === t ? c.forest : c.surfaceAlt },
              ]}
              onPress={() => { void setThemeMode(t); }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.themePillText,
                  { color: themeMode === t ? c.inkInverse : c.inkMid },
                ]}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.themeHint, { color: c.inkMuted }]}>
          {themeMode === 'system'
            ? 'Following your device appearance setting.'
            : `Using the ${themeMode} theme.`}
        </Text>

        <SectionLabel style={styles.sectionLabel}>APP ICON</SectionLabel>
        <View style={styles.iconRow}>
          {APP_ICONS.map(({ id, label }) => (
            <TouchableOpacity
              key={id}
              style={styles.iconTileWrap}
              onPress={() => setSelectedIcon(id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: c.surfaceAlt, borderColor: selectedIcon === id ? c.forest : 'transparent' },
                ]}
              >
                <Text style={[styles.iconPlaceholder, { color: c.inkMuted }]}>?</Text>
                {/* DESIGN TODO: alternate icon assets not yet created */}
              </View>
              <Text style={[styles.iconLabel, { color: c.inkMuted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
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
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    padding: spacing.sm,
  },
  themeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  themePill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  themePillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  themeHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  iconRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  iconTileWrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  iconPlaceholder: {
    fontFamily: fonts.sansMedium,
    fontSize: 20,
  },
  iconLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },
});
