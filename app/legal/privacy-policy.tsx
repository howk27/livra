import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AppText } from '../../components/Typography';
import { GradientBackground } from '../../components/GradientBackground';

export default function PrivacyPolicyScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: themeColors.surface }]}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <AppText variant="headline" style={[styles.headerTitle, { color: themeColors.text }]}>
            Privacy Policy
          </AppText>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="caption" style={[styles.lastUpdated, { color: themeColors.textSecondary }]}>
            Last updated: [Insert Date]
          </AppText>

          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            This Privacy Policy explains how Livra ("we," "our," "us") collects, uses, and protects your
            information when using our mobile application.
          </AppText>

          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            By using Livra, you agree to these practices.
          </AppText>

          {/* Section 1 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            1. Information We Collect
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            1.1. Information You Provide
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Name or display name
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Email address or login provider information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Habit marks, progress entries, categories, streak data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Preferences and app settings
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            1.2. Automatically Collected Data
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Device information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Usage statistics
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Error logs
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Anonymous analytics
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            1.3. Third-Party Authentication
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            If signing in with Apple or Google, we receive:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Name (if shared)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Email address (or private relay email)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Authentication token
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We do not access your password.
          </AppText>

          {/* Section 2 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            2. How We Use Your Information
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We use data to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Provide habit tracking and progress visualization
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Sync and store entries
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Improve app features
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Enhance security and functionality
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Communicate account-related information
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We do not sell personal data.
          </AppText>

          {/* Section 3 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            3. Data Storage & Security
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We store data securely using reputable cloud providers. Measures include encryption, access
            controls, and system monitoring. No method is 100% secure, but we take reasonable steps to
            protect your data.
          </AppText>

          {/* Section 4 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            4. Sharing of Information
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We may share limited data with:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Service providers (analytics, authentication, crash reporting)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Legal authorities if required by law
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We do not sell or rent personal information.
          </AppText>

          {/* Section 5 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            5. Your Rights
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            5.1. Access & Correction
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You can access or update your personal data in the App.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            5.2. Deletion
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You may delete your account anytime to remove personal data.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            5.3. Opt-Out
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You may disable analytics collection via your device settings.
          </AppText>

          {/* Section 6 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            6. Children's Privacy
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra is not intended for children under 13. We do not knowingly collect data from children
            below this age.
          </AppText>

          {/* Section 7 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            7. International Users
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Your information may be stored or processed in the United States. By using Livra, you consent
            to this transfer.
          </AppText>

          {/* Section 8 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            8. GDPR (EU Users)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            EU users have the right to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Access their data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Correct inaccurate information
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Request deletion
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Restrict or object to processing
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Request data portability
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            To make a request, email: [Insert Support Email]
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: themeColors.text }]}>
            Legal Bases for Processing
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Consent
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Performance of a contract
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Legitimate interests
            </AppText>
          </View>

          {/* Section 9 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            9. CCPA (California Users)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            California users have the right to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Know what data is collected
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Request deletion
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Opt out of data sale
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Not face discrimination for exercising rights
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra does not sell personal information.
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Requests can be sent to: [Insert Support Email]
          </AppText>

          {/* Section 10 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            10. Changes to This Policy
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We may update the Privacy Policy occasionally. Continued use of the App indicates acceptance
            of changes.
          </AppText>

          {/* Section 11 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            11. Contact
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            For privacy inquiries, contact:
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra Support{'\n'}Email: [Insert Support Email]
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
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

