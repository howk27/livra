import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { LivraWordmark } from '../../components/ui/LivraWordmark';
import { fonts, spacing, themedColors } from '../../theme/tokens';
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

export default function AboutScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
            Version {Constants.expoConfig?.version ?? '1.0.0'} (Build 1)
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
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  company: {
    fontFamily: fonts.sans,
    fontSize: 13,
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
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
