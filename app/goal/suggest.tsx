/**
 * /goal/suggest — post-onboarding AI plan flow (FU-6).
 *
 * Two phases in one route (mirrors onboarding's review toggle, no extra
 * navigation): describe (goal text + AI hatch) and review (shared
 * GoalPackageReview). Gating is server-only: generateGoalPackage's edge
 * function decides free_use_exhausted; the client renders an honest inline
 * panel with the paywall and an always-free manual path, never a wall.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AIHatchButton } from '../../components/ui/AIHatchButton';
import { GoalPackageReview } from '../../components/ai/GoalPackageReview';
import { GoalLimitDialog } from '../../components/ui/GoalLimitDialog';
import { PillButton } from '../../components/ui/PillButton';
import {
  fonts,
  spacing,
  radius,
  themedColors,
  fontSize,
  headerControl,
  headerControlBoxLeading,
} from '../../theme/tokens';
import { AI_EXHAUSTED_COPY } from '../../lib/copy';
import { CONTEXT_MAX_LENGTH } from '../../lib/ai/goalGeneration';
import { format } from 'date-fns';
import { X } from 'phosphor-react-native';
import type { SavedAiDraft } from '../../lib/data/mutations/aiDrafts';
import { useSuggestGoalFlow } from '../../hooks/useSuggestGoalFlow';
import { useDeferredAutoFocus } from '../../hooks/useDeferredAutoFocus';
import { useHalfRenderProbe } from '../../hooks/useHalfRenderProbe';

// ─── Header — shared between describe and review phases ────────────────────
// Split out (with SuggestDescribePhase/SuggestExhaustedPanel below) so the
// parent screen's render stays a thin phase switch instead of one large body.

interface SuggestHeaderProps {
  c: ReturnType<typeof themedColors>;
  onCancel: () => void;
}

function SuggestHeader({ c, onCancel }: SuggestHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
        <Text style={[styles.cancel, { color: c.inkMuted }]}>Cancel</Text>
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: c.inkDark }]}>Suggest a plan</Text>
      <View style={styles.headerBtn} />
    </View>
  );
}

// ─── Exhausted panel — hollow ember-tinted card language (VD-5) ─────────────
// Settled, no motion: an honest one-liner, the upsell, and an equal-weight
// always-free manual link. Never an Alert, never a hard wall.

interface SuggestExhaustedPanelProps {
  c: ReturnType<typeof themedColors>;
  panelWash: string;
  panelBorder: string;
  onUpgrade: () => void;
  onManual: () => void;
}

function SuggestExhaustedPanel({ c, panelWash, panelBorder, onUpgrade, onManual }: SuggestExhaustedPanelProps) {
  return (
    <View style={[styles.exhaustedPanel, { backgroundColor: panelWash, borderColor: panelBorder }]}>
      <Text style={[styles.exhaustedTitle, { color: c.inkDark }]}>{AI_EXHAUSTED_COPY.title}</Text>
      <Text style={[styles.exhaustedBody, { color: c.inkMuted }]}>{AI_EXHAUSTED_COPY.body}</Text>
      <PillButton label={AI_EXHAUSTED_COPY.upsell} onPress={onUpgrade} style={styles.exhaustedCta} />
      <TouchableOpacity
        style={styles.quietLinkWrap}
        onPress={onManual}
        accessibilityRole="button"
        accessibilityLabel="Build it myself"
      >
        <Text style={[styles.quietLink, { color: c.inkMid }]}>{AI_EXHAUSTED_COPY.manual}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Saved plans — reopenable drafts kept via "Save for later" ───────────────
// Quiet by design: a section that exists only when there is something in it,
// below the manual link so the primary describe→generate path stays the hero.

interface SavedPlansSectionProps {
  c: ReturnType<typeof themedColors>;
  drafts: SavedAiDraft[];
  onOpen: (draft: SavedAiDraft) => void;
  onDelete: (draft: SavedAiDraft) => void;
}

function SavedPlansSection({ c, drafts, onOpen, onDelete }: SavedPlansSectionProps) {
  if (drafts.length === 0) return null;
  return (
    <View style={styles.draftsSection}>
      <Text style={[styles.draftsLabel, { color: c.inkMuted }]}>SAVED PLANS</Text>
      {drafts.map((draft) => (
        <View
          key={draft.id}
          style={[
            styles.draftRow,
            { backgroundColor: c.surfaceAlt, borderColor: c.borderLight },
          ]}
        >
          <TouchableOpacity
            style={styles.draftOpen}
            onPress={() => onOpen(draft)}
            accessibilityRole="button"
            accessibilityLabel={`Open saved plan: ${draft.goalText}`}
          >
            <Text style={[styles.draftText, { color: c.inkDark }]} numberOfLines={1}>
              {draft.goalText}
            </Text>
            <Text style={[styles.draftMeta, { color: c.inkMuted }]}>
              Saved {format(new Date(draft.createdAt), 'MMM d')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.draftDelete}
            onPress={() => onDelete(draft)}
            accessibilityRole="button"
            accessibilityLabel={`Delete saved plan: ${draft.goalText}`}
          >
            <X size={14} color={c.inkMuted} weight="bold" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ─── Describe phase — goal text + AI hatch, or the exhausted panel ──────────

interface SuggestDescribePhaseProps {
  c: ReturnType<typeof themedColors>;
  goalText: string;
  setGoalText: (text: string) => void;
  context: string;
  setContext: (text: string) => void;
  tooShort: boolean;
  aiLoading: boolean;
  aiError: string | null;
  exhausted: boolean;
  panelWash: string;
  panelBorder: string;
  onSubmitEditing: () => void;
  onGenerate: () => void;
  onUpgrade: () => void;
  onManualInstead: () => void;
  drafts: SavedAiDraft[];
  onOpenDraft: (draft: SavedAiDraft) => void;
  onDeleteDraft: (draft: SavedAiDraft) => void;
}

function SuggestDescribePhase({
  c,
  goalText,
  setGoalText,
  context,
  setContext,
  tooShort,
  aiLoading,
  aiError,
  exhausted,
  panelWash,
  panelBorder,
  onSubmitEditing,
  onGenerate,
  onUpgrade,
  onManualInstead,
  drafts,
  onOpenDraft,
  onDeleteDraft,
}: SuggestDescribePhaseProps) {
  // VD-6/QC2-D: focus only after the pageSheet transition settles so the
  // keyboard animation never overlaps the sheet presentation (calm entrance).
  const inputRef = useDeferredAutoFocus();
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: c.inkDark }]}>
        {"What's the goal you're after?"}
      </Text>
      <Text style={[styles.subtitle, { color: c.inkMid }]}>
        {'Be specific. "Run a marathon" beats "get fit."'}
      </Text>

      <TextInput
        style={[
          styles.input,
          { backgroundColor: c.surfaceAlt, color: c.inkDark, borderColor: c.borderLight },
        ]}
        ref={inputRef}
        value={goalText}
        onChangeText={setGoalText}
        placeholder="Run a marathon, save $10k, learn Spanish…"
        placeholderTextColor={c.inkMuted}
        maxLength={80}
        returnKeyType="go"
        onSubmitEditing={onSubmitEditing}
      />

      {/* QC3-C: optional context — shapes a realistic timeframe. Never gates the
          button; leaving it blank is fine. */}
      <TextInput
        style={[
          styles.contextInput,
          { backgroundColor: c.surfaceAlt, color: c.inkDark, borderColor: c.borderLight },
        ]}
        value={context}
        onChangeText={setContext}
        placeholder="Anything that shapes this? Your experience, the time you can give it, a deadline…"
        placeholderTextColor={c.inkMuted}
        multiline
        maxLength={CONTEXT_MAX_LENGTH}
        textAlignVertical="top"
      />

      {exhausted ? (
        <SuggestExhaustedPanel
          c={c}
          panelWash={panelWash}
          panelBorder={panelBorder}
          onUpgrade={onUpgrade}
          onManual={onManualInstead}
        />
      ) : (
        <>
          <AIHatchButton
            label="✦ Let Livra suggest a plan"
            onPress={onGenerate}
            disabled={tooShort}
            loading={aiLoading}
            style={styles.hatch}
          />
          {aiError ? (
            <Text style={[styles.aiError, { color: c.danger }]}>{aiError}</Text>
          ) : (
            <Text style={[styles.hatchSub, { color: c.inkMuted }]}>
              Describe it above. Livra suggests a goal and marks. You edit before committing.
            </Text>
          )}
          <TouchableOpacity
            style={styles.quietLinkWrap}
            onPress={onManualInstead}
            accessibilityRole="button"
            accessibilityLabel="Build it myself instead"
          >
            <Text style={[styles.quietLink, { color: c.inkMid }]}>Build it myself instead</Text>
          </TouchableOpacity>
        </>
      )}
      <SavedPlansSection c={c} drafts={drafts} onOpen={onOpenDraft} onDelete={onDeleteDraft} />
    </ScrollView>
  );
}

export default function SuggestGoalScreen() {
  // QC2-D diagnostic: dev-only probe — if the half-render ever reproduces
  // again, one Metro line tells us whether the CONTAINER itself is short
  // (react-native-screens native measurement) or full (something inside).
  const onProbeLayout = useHalfRenderProbe('goal/suggest');
  const {
    c,
    router,
    goalText,
    setGoalText,
    context,
    setContext,
    aiLoading,
    aiError,
    exhausted,
    pkg,
    confirming,
    panelWash,
    panelBorder,
    tooShort,
    markHeadroom,
    goalLimitVisible,
    dismissGoalLimit,
    handleGenerate,
    handleManualInstead,
    handleDismissReview,
    handleConfirm,
    drafts,
    draftSaving,
    handleSaveForLater,
    handleOpenDraft,
    handleDeleteDraft,
  } = useSuggestGoalFlow();

  // QC-FAIL-4: the free-goal cap (thrown by handleConfirm) shows Livra's own
  // dialog, not the iOS-native Alert. Confirm happens in the review phase, so
  // the dialog is mounted there.
  const goalLimitDialog = (
    <GoalLimitDialog
      visible={goalLimitVisible}
      onClose={dismissGoalLimit}
      onSeePlus={() => {
        dismissGoalLimit();
        router.push('/paywall');
      }}
    />
  );

  // ── Phase 2: review ────────────────────────────────────────────────────────
  if (pkg) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]} onLayout={onProbeLayout}>
        <SuggestHeader c={c} onCancel={() => router.back()} />
        <GoalPackageReview
          pkg={pkg}
          onConfirm={handleConfirm}
          onDismiss={handleDismissReview}
          dismissLabel="Start over"
          confirming={confirming}
          markHeadroom={markHeadroom}
          onUpgrade={() => router.push('/paywall')}
          onSaveForLater={() => void handleSaveForLater()}
          savingDraft={draftSaving}
        />
        {goalLimitDialog}
      </SafeAreaView>
    );
  }

  // ── Phase 1: describe ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]} onLayout={onProbeLayout}>
      {/* QC2-D: no KeyboardAvoidingView here, deliberately — it was the root of
          the device half-render (see app/goal/new.tsx). All content is
          top-anchored and already lives in a ScrollView, so nothing needs to
          avoid the keyboard. */}
      <View style={styles.container}>
        <SuggestHeader c={c} onCancel={() => router.back()} />
        <SuggestDescribePhase
          c={c}
          goalText={goalText}
          setGoalText={setGoalText}
          context={context}
          setContext={setContext}
          tooShort={tooShort}
          aiLoading={aiLoading}
          aiError={aiError}
          exhausted={exhausted}
          panelWash={panelWash}
          panelBorder={panelBorder}
          onSubmitEditing={() => {
            if (!tooShort && !aiLoading && !exhausted) void handleGenerate();
          }}
          onGenerate={() => void handleGenerate()}
          onUpgrade={() => router.push('/paywall')}
          onManualInstead={handleManualInstead}
          drafts={drafts}
          onOpenDraft={handleOpenDraft}
          onDeleteDraft={(d) => void handleDeleteDraft(d)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // QC4-K: paddingTop = headerControl.topGap so Cancel clears the safe-area
  // inset; the target itself already met the 44pt minimum.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
  },
  headerBtn: {
    ...headerControlBoxLeading,
    minWidth: 60,
  },
  headerTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.md,
  },
  cancel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 100,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize['2xl'],
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    borderWidth: 1,
    marginTop: spacing.xl,
  },
  contextInput: {
    minHeight: 72,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    borderWidth: 1,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  hatch: {
    marginTop: spacing.lg,
  },
  hatchSub: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  aiError: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  quietLinkWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  quietLink: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  exhaustedPanel: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  exhaustedTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  exhaustedBody: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  exhaustedCta: {
    marginTop: spacing.md,
    height: 48,
  },
  draftsSection: {
    marginTop: spacing.xl,
  },
  draftsLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  draftOpen: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  draftText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
  },
  draftMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  draftDelete: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
