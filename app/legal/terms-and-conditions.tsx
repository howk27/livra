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

export default function TermsAndConditionsScreen() {
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
            Terms & Conditions
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
            Welcome to Livra. By downloading, accessing, or using the Livra mobile application ("App"),
            you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree, you may not
            use the App.
          </AppText>

          {/* Section 1 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            1. About Livra
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra is a productivity and lifestyle-tracking app that helps users record daily marks, track
            habits, view progress, and organize personal improvement goals.
          </AppText>

          {/* Section 2 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            2. Eligibility
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You must be at least 13 years old (or the age required by your local laws) to use Livra. By
            using the App, you confirm that you meet this requirement.
          </AppText>

          {/* Section 3 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            3. Accounts
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • You may create an account using email and password authentication.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • You are responsible for keeping your login credentials secure.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Livra may terminate or suspend any account that violates these Terms.
            </AppText>
          </View>

          {/* Section 4 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            4. App Usage
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You agree not to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Use Livra for unlawful or harmful purposes.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Interfere with the App's functionality.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Attempt to reverse engineer, modify, or exploit the App.
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra grants you a personal, non-transferable, non-exclusive license to use the App for your
            own productivity and habit-tracking.
          </AppText>

          {/* Section 5 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            5. Subscriptions & Payments (If Applicable)
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Some features may require a subscription.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Payments are processed through the App Store or Google Play.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • All purchases follow Apple/Google refund policies.
            </AppText>
          </View>

          {/* Section 6 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            6. Content Ownership
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            All trademarks, designs, icons, and content provided by Livra remain the property of Livra. You
            may not copy, distribute, or resell any part of the App.
          </AppText>

          {/* Section 7 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            7. User Data
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            You retain ownership of the data you add to Livra. By using the App, you grant Livra permission
            to store, process, and display your data solely to provide the App's features.
          </AppText>

          {/* Section 8 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            8. Third-Party Services
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra may integrate with:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Authentication providers
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Analytics tools
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Cloud databases
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            These third parties have their own terms and privacy policies.
          </AppText>

          {/* Section 9 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            9. Disclaimer
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra is provided "as is" without warranties of any kind. We do not guarantee:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Accuracy of data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Uninterrupted service
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Prevention of data loss
            </AppText>
          </View>

          {/* Section 10 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            10. Limitation of Liability
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Livra is not liable for:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Loss of data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Damages caused by misuse
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: themeColors.text }]}>
              • Issues arising from third-party systems or devices
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            Using the App is at your own risk.
          </AppText>

          {/* Section 11 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            11. Changes to the App
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We may update or modify Livra at any time, including adding or removing features.
          </AppText>

          {/* Section 12 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            12. Termination
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            We may suspend or terminate access for accounts that violate these Terms. Users may delete
            their accounts at any time.
          </AppText>

          {/* Section 13 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            13. Governing Law
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            These Terms are governed by the laws of the United States and your state of residence, unless
            otherwise required by law.
          </AppText>

          {/* Section 14 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: themeColors.text }]}>
            14. Contact
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            For questions about these Terms, contact:
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: themeColors.text }]}>
            [Insert Support Email]
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

