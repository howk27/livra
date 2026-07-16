import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { themedColors, spacing, borderRadius, headerControl } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AppText } from '../../components/Typography';
import { GradientBackground } from '../../components/GradientBackground';

export default function PrivacyPolicyScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.borderLight }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: c.surface }]}
          >
            <ArrowLeft size={24} color={c.inkDark} weight="bold" />
          </TouchableOpacity>
          <AppText variant="headline" style={[styles.headerTitle, { color: c.inkDark }]}>
            Privacy Policy
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="caption" style={[styles.lastUpdated, { color: c.inkMuted }]}>
            Last updated: January 11, 2025
          </AppText>

          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            This Privacy Policy explains how Livra ("we," "our," "us") collects, uses, and protects your
            information when using our mobile application.
          </AppText>

          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            By using Livra, you agree to these practices.
          </AppText>

          {/* Section 1 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            1. Information We Collect
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            1.1. Information You Provide
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Name or display name
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Email address or login provider information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Habit marks, progress entries, categories, momentum data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Preferences and app settings
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            1.2. Automatically Collected Data
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Device information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Usage statistics
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Error logs
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Anonymous analytics
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            1.3. Third-Party Authentication
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            If signing in with Apple or Google, we receive:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Name (if shared)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Email address (or private relay email)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Authentication token
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We do not access your password.
          </AppText>

          {/* Section 2 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            2. How We Use Your Information
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We use data to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Provide habit tracking and progress visualization
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Sync and store entries
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Improve app features
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Enhance security and functionality
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Communicate account-related information
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We do not sell personal data.
          </AppText>

          {/* Section 3 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            3. Data Storage & Security
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We store data securely using reputable cloud providers. Measures include encryption, access
            controls, and system monitoring. No method is 100% secure, but we take reasonable steps to
            protect your data.
          </AppText>

          {/* Section 4 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            4. Sharing of Information
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We may share limited data with:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Service providers (analytics, authentication, crash reporting)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Legal authorities if required by law
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We do not sell or rent personal information.
          </AppText>

          {/* Section 5 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            5. Your Rights
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.1. Access & Correction
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You can access or update your personal data in the App.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.2. Deletion
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You may delete your account anytime to remove personal data.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.3. Opt-Out
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You may disable analytics collection via your device settings.
          </AppText>

          {/* Section 6 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            6. Children's Privacy
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is not intended for children under 13. We do not knowingly collect data from children
            below this age.
          </AppText>

          {/* Section 7 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            7. International Users
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Your information may be stored or processed in the United States. By using Livra, you consent
            to this transfer.
          </AppText>

          {/* Section 8 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            8. GDPR (EU Users)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            EU users have the right to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Access their data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Correct inaccurate information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Request deletion
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Restrict or object to processing
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Request data portability
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            To make a request, email: support@livralife.com
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            Legal Bases for Processing
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Consent
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Performance of a contract
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Legitimate interests
            </AppText>
          </View>

          {/* Section 9 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            9. CCPA (California Users)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            California users have the right to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Know what data is collected
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Request deletion
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Opt out of data sale
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Not face discrimination for exercising rights
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra does not sell personal information.
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Requests can be sent to: support@livralife.com
          </AppText>

          {/* Section 10 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            10. Changes to This Policy
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We may update the Privacy Policy occasionally. Continued use of the App indicates acceptance
            of changes.
          </AppText>

          {/* Section 11 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            11. Contact
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            For privacy inquiries, contact:
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra Support{'\n'}Email: support@livralife.com
          </AppText>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    // QC4-K: paddingTop = the shared headerControl.topGap (same value as the
    // spacing.md it replaces — pinned to the token so it stays converged).
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  // QC4-K: 40x40 was under the 44pt iOS HIG minimum.
  backButton: {
    width: headerControl.minTarget,
    height: headerControl.minTarget,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Matches backButton's width so the title stays optically centred.
  headerSpacer: { width: headerControl.minTarget },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  lastUpdated: {
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  subsectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  paragraph: {
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  bulletList: {
    marginLeft: spacing.md,
    marginBottom: spacing.md,
  },
  bulletItem: {
    marginBottom: spacing.xs,
    lineHeight: 24,
  },
});

