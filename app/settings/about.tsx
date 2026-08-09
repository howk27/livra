import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { LivraWordmark } from '../../components/ui/LivraWordmark';
import { fonts, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

const LINKS = [
  { label: 'Privacy Policy', url: 'https://livralife.com/privacy' },
  { label: 'Terms of Service', url: 'https://livralife.com/terms' },
  {
    label: 'Open Source Licenses',
    url: null,
    // DESIGN TODO: generate licenses list and link to dedicated screen
  },
];

/**
 * The build this binary actually is, read from the same app config that
 * governs the build — NOT a literal.
 *
 * This screen shipped "(Build 1)" hardcoded, so every release since build 1
 * told the user the wrong number. It is the one place a person looks to report
 * "which build am I on", which is exactly when a wrong answer costs the most.
 * Falls back to the version string's own trailing segment rather than to a
 * number that would be a fresh lie.
 */
function resolveBuildLabel(): string {
  const config = Constants.expoConfig;
  const native =
    Platform.OS === 'ios'
      ? config?.ios?.buildNumber
      : config?.android?.versionCode?.toString();
  return native ?? config?.version?.split('.').pop() ?? '—';
}

export default function AboutScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const buildLabel = resolveBuildLabel();
  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="About" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.centered}>
          <SvgLogo color={theme === 'dark' ? c.inkDark : c.forest} width={48} height={24} />
          <View style={{ marginTop: spacing.md }}>
            <LivraWordmark color={c.inkDark} fontSize={24} letterSpacing={6} />
          </View>

          <Text style={[styles.version, { color: c.inkMuted }]}>
            Version {Constants.expoConfig?.version ?? '1.0.0'} (Build {buildLabel})
          </Text>
          <Text style={[styles.company, { color: c.inkMuted }]}>Sierra Link LLC</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: c.borderLight }]} />

        <View style={styles.linksBlock}>
          {LINKS.map(({ label, url }) => (
            <TouchableOpacity
              key={label}
              onPress={() => url && Linking.openURL(url).catch(() => {})}
              activeOpacity={url ? 0.7 : 1}
              style={styles.linkRow}
            >
              <Text style={[styles.linkText, { color: url ? c.accent : c.inkMuted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.footer, { color: c.inkMuted }]}>Made with intention.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  version: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  company: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xl,
  },
  linksBlock: {
    alignItems: 'center',
    gap: spacing.md,
  },
  linkRow: {},
  linkText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  footer: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
