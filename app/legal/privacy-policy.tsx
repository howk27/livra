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
            Last updated: August 9, 2026
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

          {/* HealthKit 5.1.3 drift fix: the binary declares the HealthKit
              entitlement, so the policy must describe the data — claims below
              mirror NSHealthShareUsageDescription (app.json:32) and are pinned
              by tests/unit/copyHealthPrivacy.test.ts.
              2026-08-05, health auto-sync: the old "never stored on our
              servers" line became false the moment a health-qualified day
              started writing a mark_events row (lib/health/autoSync.ts,
              lib/data/mutations/checkins.ts, source column applied
              20260805_mark_events_source.sql). What is still true is narrower
              and stated below: the readers reduce every sample to a day-set
              on device (lib/health/healthReader.ts), so the VALUES never
              leave — the qualifying day and its attribution do. */}
          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            1.4. Apple Health Data (Optional)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            If you connect a mark to Apple Health, Livra reads your workouts, mindful sessions,
            steps, and sleep to automatically log check-ins for that mark and to power your weekly
            reflection. Connecting is optional, is part of Livra Pro, and always starts with the
            iOS permission prompt.
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Your health readings stay on your device. Livra checks each day against your mark
              and keeps only whether that day qualified. The underlying values, such as workout
              durations, step counts, sleep hours and water amounts, are discarded on your device
              and never sent to us
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • When a day qualifies, Livra creates a check-in for that mark. Those check-ins are
              synced to our servers like any other check-in, and are labeled as logged from Apple
              Health so you can tell them apart
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Which marks you connected and the targets you set for them are kept on your device
              only
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Our usage analytics record that a check-in was logged from Apple Health. They never
              carry your health readings
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • We never sell health data or use it for advertising or marketing
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • You can revoke access anytime in the iOS Health app under Sharing. Check-ins already
              logged stay in your history until you delete them
            </AppText>
          </View>

          {/* 1.5 — AI drafting, added 2026-08-09. The policy said nothing about
              AI while typed goal text was leaving the device AND being retained.
              Grounded facts only:
                - model + provider + endpoint: supabase/functions/ai-goal-generation/index.ts:47-48
                  (api.openai.com, gpt-4o-mini); key read from Deno.env at :249, so
                  it is server-side only
                - what is sent: goalText + optional context (capped 400 chars,
                  index.ts:56, :272) and the app's own prompt scaffolding
                  (buildSystemPrompt/buildUserMessage, :150-193). No name, email
                  or user id is put in the message body (:207-215)
                - what is retained: public.ai_goal_packages — goal_text,
                  goal_text_normalized, package_json, confirmed, user_id,
                  created_at (20260613_ai_uses.sql:24-36). Written CLIENT-side on
                  confirm+activate only (lib/ai/goalGeneration.ts:354-376, called
                  from lib/goals/createFromAIPackage.ts:169 and
                  app/onboarding.tsx:341) — a discarded draft writes no row
                - who can read it: RLS SELECT is auth.uid() = user_id
                  (20260613_ai_uses.sql:50-51)
                - deletion: there is NO DELETE policy on the table (only
                  INSERT/SELECT/UPDATE), so a user cannot remove one saved draft;
                  the FK is REFERENCES auth.users(id) ON DELETE CASCADE
                  (:26) and 20260614_delete_account_cascade_check.sql asserts that
                  cascade, so account deletion DOES remove these rows. The text
                  below promises exactly that and nothing more.
                - rate-limit rows: ai_generation_events holds id/user_id/created_at
                  only, pruned past 25 hours
                  (20260727_ai_generation_rate_limit.sql:47-51, :105-107)
                - training/retention: FOUNDER-CONFIRMED 2026-08-09 — the Livra
                  OpenAI org has NOT opted in to data sharing, and Zero Data
                  Retention IS enabled. So the generic "retained up to 30 days
                  for abuse monitoring" line that applies to ordinary API use
                  does NOT apply to us, and saying it would have been a third
                  wrong retention claim in this codebase. Re-confirm both toggles
                  in the OpenAI dashboard before restating them; they are account
                  settings that can change without any commit here.
                - deletion is now a real control, not a support email:
                  ai_packages_delete RLS policy (20260809_ai_goal_packages_user_delete.sql)
                  + lib/data/mutations/aiDrafts.ts + Settings › Data.
              Mirrors the Terms section 6; do not write that goal text is only
              relayed or not stored. It is stored. */}
          <AppText variant="body" style={[styles.subsectionTitle, { color: c.inkDark }]}>
            1.5. AI Goal Drafting (Optional)
          </AppText>
          <AppText variant="body" style={[styles.paragraph, { color: c.inkDark }]}>
            AI goal drafting is optional and runs only when you ask for a draft. When you do, the
            goal text you type, plus any optional context you add (up to 400 characters), is sent
            from your device to our server, and from our server to OpenAI, which returns a suggested
            goal and marks. The model used is gpt-4o-mini. Our access key stays on our server and is
            not included in the app.
          </AppText>
          <View style={styles.bulletList}>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • What goes to OpenAI: the goal text you type, the optional context, and the
              instructions our app sends with it. We do not put your name, email address, or account
              identifier in that request
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • What we keep: when you create a goal from a draft, we save the goal text you typed, a
              simplified copy of that text used to recognise repeat requests, and the generated plan.
              These are stored on our servers, in your account, alongside your other data. A draft
              you discard is not saved
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Why we keep it: so that asking for the same goal again returns your saved plan
              instead of calling the model a second time
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Who can see it: database access rules limit these records to your own account. Our
              administrators can access them to operate, support, and troubleshoot the service
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • How long we keep it: until you delete it or delete your account. Settings › Data ›
              Delete Saved AI Drafts removes every saved goal text from your account at any time,
              and it does not touch the goals or marks you already created. Deleting a goal on its
              own does not remove the saved text
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Training and retention at OpenAI: we have not opted in to data sharing, so OpenAI
              does not use what we send to train or improve its models. Our account also has Zero
              Data Retention enabled, which means OpenAI does not store the request after it answers
              — the 30-day abuse-monitoring window that applies to ordinary API use does not apply
              to ours
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Usage limits: we record the time of each AI request against your account so we can
              apply hourly and daily limits. Those records hold no goal text and are removed after
              about a day
            </AppText>
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • AI drafts are suggestions, not professional advice, and can be wrong or incomplete
            </AppText>
          </View>

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
            <AppText variant="body" style={[styles.bulletItem, { color: c.inkDark }]}>
              • Generate and save the AI goal drafts you ask for, as described in section 1.5
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
              • OpenAI, in the United States, which receives the goal text and optional context you
              submit for AI goal drafting, as described in section 1.5
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
            You may delete your account anytime to remove personal data. Deleting your account also
            removes the AI goal drafts saved under it, described in section 1.5. You can remove
            those separately at any time, without deleting your account, from Settings › Data ›
            Delete Saved AI Drafts.
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

