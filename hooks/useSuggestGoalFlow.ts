/**
 * useSuggestGoalFlow — state + handlers for /goal/suggest (FU-6).
 *
 * Extracted from SuggestGoalScreen (fallow audit: cognitive/CRAP severity
 * "high", driven mostly by hook-density in the screen component) so the
 * screen itself is a thin phase switch that calls one hook and renders.
 * No behavior change — every state field, effect, and handler here is
 * identical to what previously lived inline in the screen component.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffectiveTheme } from '../state/uiSlice';
import { themedColors } from '../theme/tokens';
import { useAuth } from './useAuth';
import { GoalLimitError } from '../lib/errors';
import { checkProStatus } from '../lib/iap/iap';
import { applyOpacity } from '../src/components/icons/color';
import { GENERATION_ERROR_COPY } from '../lib/copy';
import { createFromAIPackage } from '../lib/goals/createFromAIPackage';
import { useMarksForUser } from '../lib/data/marks';
import { countActiveMarks } from '../lib/gating';
import {
  allowedPackageMarkCount,
  generateGoalPackage,
  meetsGoalTextGate,
  type AIGoalPackage,
} from '../lib/ai/goalGeneration';
import type { GoalPackageReviewSelection } from '../components/ai/GoalPackageReview';
import {
  saveAiDraft,
  listSavedAiDrafts,
  deleteSavedAiDraft,
  type SavedAiDraft,
} from '../lib/data/mutations/aiDrafts';
import { confirm } from '../components/ui/overlays';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { logger } from '../lib/utils/logger';
import { useNotification } from '../contexts/NotificationContext';

export type SuggestSource = 'goals' | 'goal_create_fallback';

export function useSuggestGoalFlow() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user, initialized } = useAuth();
  const { showError, showSuccess } = useNotification();
  const params = useLocalSearchParams<{ goalText?: string; source?: string }>();

  const source: SuggestSource =
    params.source === 'goal_create_fallback' ? 'goal_create_fallback' : 'goals';

  const [goalText, setGoalText] = useState(
    typeof params.goalText === 'string' ? params.goalText : '',
  );
  // QC3-C: optional free-text the user gives about their experience, the time
  // they can give it, or a deadline — fed to the model to set a realistic
  // timeframe. Never gates the button; blank is fine.
  const [context, setContext] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pkg, setPkg] = useState<AIGoalPackage | null>(null);
  const [confirming, setConfirming] = useState(false);
  // QC-FAIL-4: the free-goal cap surfaces as Livra's own GoalLimitDialog, never
  // the iOS-native Alert (the manual goal-create path was fixed the same way).
  const [goalLimitVisible, setGoalLimitVisible] = useState(false);
  // Pro status for the review's over-limit note (#5). Defaults false — the safe
  // default, since only a free account near the mark ceiling ever sees the note;
  // it flips true once checkProStatus resolves, hiding the note for Pro.
  const [isPro, setIsPro] = useState(false);
  // M9 Phase 5A Task 6: the ceiling count reads the query layer (live rows
  // already exclude tombstones; countActiveMarks re-filters harmlessly).
  const marks = useMarksForUser().data ?? [];

  // How many marks THIS new goal can actually hold (per-goal cap AND the
  // account-wide ceiling, whichever binds). Drives the soft over-limit note.
  const markHeadroom = useMemo(
    () => allowedPackageMarkCount(isPro, countActiveMarks(marks)),
    [isPro, marks],
  );

  // Saved drafts (2026-08-24, founder call): plans kept via "Save for later",
  // listed on the describe phase and reopened straight into review — no model
  // call, no gate, same economics as the confirmed-cache read server-side.
  const [drafts, setDrafts] = useState<SavedAiDraft[]>([]);
  const [draftSaving, setDraftSaving] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Best-effort surface: a failed list leaves the section empty rather than
    // blocking the describe phase behind an error state.
    listSavedAiDrafts(userId)
      .then((d) => {
        if (!cancelled) setDrafts(d);
      })
      .catch((err) => logger.warn('[suggest] drafts list failed:', err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Authed-screen guard: bounce a signed-out session like other authed screens.
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/auth/signin');
    }
  }, [initialized, user, router]);

  // Resolve Pro status once the review is up, so the over-limit note reflects
  // the real plan. Best-effort; a failure leaves the safe free default.
  useEffect(() => {
    if (!pkg) return;
    let cancelled = false;
    void checkProStatus()
      .then((s) => { if (!cancelled) setIsPro(s.effectiveUnlocked); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pkg]);

  // VD-5 ember hatch: the AI voice speaks in ember, so the exhausted panel's
  // hollow-card wash + border derive from `ember` (same alphas as the FU-5
  // forest treatment). Structure elements on the screen stay ink/forest.
  const panelWash = useMemo(
    () => applyOpacity(c.ember, theme === 'dark' ? 0.1 : 0.07),
    [c.ember, theme],
  );
  const panelBorder = useMemo(() => applyOpacity(c.ember, 0.55), [c.ember]);

  // QC3-B: the AIHatchButton enables the moment the text clears the relaxed
  // gate (short length floor + one real word), so "save 10k" / "read" pass.
  const tooShort = !meetsGoalTextGate(goalText);

  const handleGenerate = useCallback(async () => {
    if (!user?.id) return;
    setAiLoading(true);
    setAiError(null);

    const result = await generateGoalPackage(goalText.trim(), context);
    setAiLoading(false);

    if (result.ok) {
      setPkg(result.package);
      return;
    }
    if (result.reason === 'free_use_exhausted') {
      setExhausted(true);
      capture(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED, {
        source,
        confidence: null,
        outcome: 'exhausted',
      });
      return;
    }
    setAiError(GENERATION_ERROR_COPY[result.reason] || 'Something went wrong.');
  }, [user?.id, goalText, context, source]);

  const handleManualInstead = useCallback(() => {
    // VD-6: never present the next pageSheet while the keyboard is up —
    // the incoming modal gets measured against the keyboard-shrunk area.
    Keyboard.dismiss();
    const trimmed = goalText.trim();
    router.replace(
      trimmed
        ? { pathname: '/goal/new' as any, params: { title: trimmed } }
        : ('/goal/new' as any),
    );
  }, [router, goalText]);

  const handleDismissReview = useCallback(() => {
    capture(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED, {
      source,
      confidence: pkg?.confidence ?? null,
      outcome: 'dismissed',
    });
    setPkg(null); // back to phase 1, text preserved
  }, [source, pkg]);

  // "Save for later" on the review: keep the plan without activating it.
  // Leaves via router.back() like confirm does — the draft now lives on the
  // describe phase's list, and staying on the review would invite a second
  // save of the same thing.
  const handleSaveForLater = useCallback(async () => {
    if (!userId || !pkg) return;
    setDraftSaving(true);
    try {
      await saveAiDraft(userId, goalText.trim(), pkg);
      capture(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED, {
        source,
        confidence: pkg.confidence,
        outcome: 'saved',
      });
      showSuccess('Plan saved for later.');
      router.back();
    } catch (err) {
      showError('Could not save the plan. Please try again.');
      logger.error('[suggest] save-for-later failed:', err);
    } finally {
      setDraftSaving(false);
    }
  }, [userId, pkg, goalText, source, router, showError, showSuccess]);

  // Reopen a saved plan straight into review. Free by design: the package is
  // already paid for, exactly like the server's confirmed-cache read.
  const handleOpenDraft = useCallback(
    (draft: SavedAiDraft) => {
      setGoalText(draft.goalText);
      setPkg(draft.pkg);
      capture(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED, {
        source,
        confidence: draft.pkg.confidence,
        outcome: 'resumed',
      });
    },
    [source],
  );

  const handleDeleteDraft = useCallback(
    async (draft: SavedAiDraft) => {
      const ok = await confirm({
        title: 'Delete this saved plan?',
        message: `"${draft.goalText}" will be gone for good.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok || !userId) return;
      try {
        await deleteSavedAiDraft(userId, draft.id);
        setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      } catch (err) {
        showError('Could not delete the plan. Please try again.');
        logger.error('[suggest] draft delete failed:', err);
      }
    },
    [userId, showError],
  );

  const handleConfirm = useCallback(
    async (selection: GoalPackageReviewSelection) => {
      if (!user?.id || !pkg) return;
      setConfirming(true);
      try {
        const proStatus = await checkProStatus();
        await createFromAIPackage({
          userId: user.id,
          isPro: proStatus.effectiveUnlocked,
          goalText: goalText.trim(),
          pkg,
          title: selection.title,
          description: selection.description,
          marks: selection.marks,
        });
        capture(ANALYTICS_EVENTS.AI_PLAN_SUGGESTED, {
          source,
          confidence: pkg.confidence,
          outcome: 'confirmed',
        });
        router.back();
      } catch (err) {
        if (err instanceof GoalLimitError) {
          // Soft cap surface — Livra's own popup, never the iOS-native Alert.
          setGoalLimitVisible(true);
        } else {
          showError('Could not save goal. Please try again.');
        }
        logger.error('[suggest] confirm failed:', err);
      } finally {
        setConfirming(false);
      }
    },
    [user?.id, pkg, goalText, source, router, showError],
  );

  return {
    theme,
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
    dismissGoalLimit: () => setGoalLimitVisible(false),
    handleGenerate,
    handleManualInstead,
    handleDismissReview,
    handleConfirm,
    drafts,
    draftSaving,
    handleSaveForLater,
    handleOpenDraft,
    handleDeleteDraft,
  };
}
