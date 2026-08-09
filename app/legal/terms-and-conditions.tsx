import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import { themedColors, spacing, borderRadius, headerControl } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AppText } from '../../components/Typography';
import { GradientBackground } from '../../components/GradientBackground';

export default function TermsAndConditionsScreen() {
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
            Terms & Conditions
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
            Last updated: August 9, 2026
          </AppText>

          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Welcome to Livra. By downloading, accessing, or using the Livra mobile application ("App"),
            you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree, you may not
            use the App.
          </AppText>

          {/* Section 1 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            1. About Livra
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is a goal and habit app that helps you record daily marks, track progress, and finish
            the goals you set. Livra is published by Sierra Link LLC, a Florida limited liability company.
          </AppText>

          {/* Section 2 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            2. Eligibility
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You must be at least 13 years old (or the age required by your local laws) to use Livra. By
            using the App, you confirm that you meet this requirement.
          </AppText>

          {/* Section 3 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            3. Accounts
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • You may create an account using email and password authentication.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • You are responsible for keeping your login credentials secure.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Livra may terminate or suspend any account that violates these Terms.
            </AppText>
          </View>

          {/* Section 4 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            4. App Usage
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You agree not to:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Use Livra for unlawful or harmful purposes.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Interfere with the App's functionality.
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Attempt to reverse engineer, modify, or exploit the App.
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra grants you a personal, non-transferable, non-exclusive license to use the App for your
            own goal and habit tracking. On iOS, this license is granted under the Standard End User
            License Agreement published by Apple, except where these Terms say otherwise.
          </AppText>

          {/* Section 5 — App Store Review 3.1.2: an auto-renewing subscription
              needs its name, term, renewal behaviour, cancellation path and
              price basis stated in functional Terms, and App Review opens this
              screen from the paywall's Terms link (app/paywall.tsx). No price
              or trial length is stated here on purpose: prices live in App
              Store Connect and vary by storefront, so a number written here
              becomes a lie. Free-tier figures are the enforced ones in
              lib/gating.ts (FREE_GOAL_LIMIT 2, FREE_MARK_CEILING 6,
              FREE_MARKS_PER_GOAL 4). Livra+ contents mirror the paywall's
              PRO_FEATURES list; renewal wording mirrors the published
              subscription terms at livralife.com/subscription-terms. */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            5. Free Tier & Livra+ Subscriptions
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.1. What is free
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is free to use. A free account can run 2 goals at a time and hold up to 6 marks in
            total, with up to 4 marks on any one goal. Your history, stats, and progress are never
            paywalled.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.2. What Livra+ adds
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra+ is an optional paid subscription. It removes those limits and unlocks:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Unlimited goals
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Unlimited marks per goal
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • AI goal drafting
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Apple Health sync
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Data export
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Finish-card styling
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.3. Term, price, and automatic renewal
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Livra+ is an auto-renewing subscription, offered as a monthly plan (a one-month term)
              and an annual plan (a twelve-month term)
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • The price and currency for your plan are shown on the purchase screen before you
              confirm. Prices vary by App Store storefront and may differ from prices shown elsewhere
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Payment is charged to your Apple Account when you confirm the purchase
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Your subscription renews automatically for another term of the same length unless you
              turn off auto-renewal at least 24 hours before the current period ends. Apple charges the
              renewal within the 24 hours before the period ends, at the then-current price for your plan
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • If an introductory or trial offer is available to you, its length and terms are shown on
              the purchase screen before you confirm
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Apple gives advance notice of a price increase and asks for your agreement before
              charging the new price
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.4. Managing and cancelling
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • You can manage or cancel Livra+ at any time in your Apple Account settings: iOS Settings
              → your name → Subscriptions → Livra+ → Cancel Subscription. In the App, Settings →
              Subscription opens the same place
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Cancel at least 24 hours before the current period ends to avoid the next charge
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Cancelling stops future renewals. Livra+ stays active until the end of the period you
              already paid for
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Deleting the App does not cancel your subscription
            </AppText>
          </View>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.5. Payments and refunds
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra+ is sold through the App Store. Apple is the merchant of record, bills you, and handles
            refunds; Livra never receives or stores your payment details. Refund requests go to Apple at
            reportaproblem.apple.com or through App Store support, and are decided under the policies
            Apple sets.
            If a purchase is refunded, Livra+ access ends and your account returns to the free tier.
          </AppText>

          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            5.6. When Livra+ ends
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Your account returns to the free tier. Nothing you created is deleted, but content above the
            free limits may be unavailable until you resubscribe or bring your usage back within those
            limits.
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            The full Livra+ Subscription Terms at https://www.livralife.com/subscription-terms also apply
            and are part of these Terms.
          </AppText>

          {/* Section 6 — mirrors the website Terms §6. AI drafting sends the
              goal text you type to OpenAI through our server
              (supabase/functions/ai-goal-generation/index.ts); the key never
              reaches the client and the free-use gate is enforced there. */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            6. AI Goal Drafting
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            When you use AI drafting, the goal text you type is sent through our servers to a third-party
            AI provider, which returns a suggested goal and marks. You can edit or discard the draft
            before saving it.
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            AI drafts are suggestions, not professional advice. They can be wrong or incomplete. Consult a
            qualified professional before acting on anything health-, financial-, or safety-related. AI
            drafting is limited on the free tier; the App states the limit where you use it, and Livra+
            removes it.
          </AppText>

          {/* Section 7 — mirrors the App's Privacy Policy §1.4 exactly: the
              readings are reduced to a day-set on device, but a qualifying day
              DOES create a check-in that syncs. Do not write "health data never
              leaves your device" here — that claim died with health auto-sync
              (lib/health/autoSync.ts). */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            7. Apple Health (Optional)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Connecting Apple Health is optional, is part of Livra+, and always starts with the iOS
            permission prompt. Livra checks your readings on your device and keeps only whether a day met
            your mark; when a day qualifies, Livra creates a check-in that syncs like any other check-in.
            The Privacy Policy describes this in full.
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is not a medical device. Reflections and suggestions based on this data are
            informational, not medical advice.
          </AppText>

          {/* Section 8 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            8. Content Ownership
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            All trademarks, designs, icons, and content provided by Livra remain the property of Livra. You
            may not copy, distribute, or resell any part of the App.
          </AppText>

          {/* Section 9 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            9. User Data
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            You retain ownership of the data you add to Livra. By using the App, you grant Livra permission
            to store, process, and display your data solely to provide the App's features.
          </AppText>

          {/* Section 10 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            10. Third-Party Services
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra relies on:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Apple, for App Store billing of Livra+
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Authentication providers
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • An AI provider, for AI goal drafting
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Analytics tools
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Cloud databases
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            These third parties have their own terms and privacy policies.
          </AppText>

          {/* Section 11 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            11. Disclaimer
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is provided "as is" without warranties of any kind. We do not guarantee:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Accuracy of data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Uninterrupted service
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Prevention of data loss
            </AppText>
          </View>

          {/* Section 12 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            12. Limitation of Liability
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Livra is not liable for:
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Loss of data
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Damages caused by misuse
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Issues arising from third-party systems or devices
            </AppText>
          </View>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            Using the App is at your own risk. Where the law allows a cap, our total liability to you is
            limited to the greater of the amount you paid us in the 12 months before the claim, or 50 USD.
            Some jurisdictions do not allow these limits, so parts of this section may not apply to you.
          </AppText>

          {/* Section 13 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            13. Changes to the App and to These Terms
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We may update or modify Livra at any time, including adding or removing features. If we
            materially reduce what an active Livra+ subscription includes, you may cancel, and you keep
            any remedy the law gives you. We may also update these Terms; the date at the top of this
            screen shows when they last changed.
          </AppText>

          {/* Section 14 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            14. Termination
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            We may suspend or terminate access for accounts that violate these Terms. You may delete your
            account at any time. Deleting your account does not by itself cancel a Livra+ subscription —
            cancel that in your Apple Account settings as described in section 5.
          </AppText>

          {/* Section 15
              FOUNDER-CONFIRMED 2026-08-09, along with the liability cap in §12.
              Both were adopted from the live livralife.com/terms rather than
              invented here — the in-app document was the outlier, still carrying
              "the United States and your state of residence" from the January
              2025 boilerplate. The founder confirmed he intends both in-app too.
              These are legal positions, not code: change them on his word, not
              on a reviewer's preference. */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            15. Governing Law
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            These Terms are governed by the laws of the State of Florida, USA, without regard to
            conflict-of-laws rules, except where the law of your home country or state gives you rights
            that cannot be waived.
          </AppText>

          {/* Section 16 */}
          <AppText variant="subtitle" style={[styles.sectionTitle, { color: c.inkDark }]}>
            16. Contact
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            For questions about these Terms, contact:
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
  // Same values as the Privacy Policy's subsectionTitle — the two legal screens
  // are siblings and section 5 is long enough to need the second level.
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

