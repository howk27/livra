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
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffectiveTheme } from '../state/uiSlice';
import { themedColors } from '../theme/tokens';
import { useAuth } from './useAuth';
import { GoalLimitError } from '../state/goalsSlice';
import { checkProStatus } from '../lib/iap/iap';
import { applyOpacity } from '../src/components/icons/color';
import { GOAL_LIMIT_MESSAGE, GENERATION_ERROR_COPY } from '../lib/copy';
import { createFromAIPackage } from '../lib/goals/createFromAIPackage';
import {
  generateGoalPackage,
  MIN_GOAL_LENGTH,
  type AIGoalPackage,
} from '../lib/ai/goalGeneration';
import type { GoalPackageReviewSelection } from '../components/ai/GoalPackageReview';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { logger } from '../lib/utils/logger';

export type SuggestSource = 'goals' | 'goal_create_fallback';

export function useSuggestGoalFlow() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user, initialized } = useAuth();
  const params = useLocalSearchParams<{ goalText?: string; source?: string }>();

  const source: SuggestSource =
    params.source === 'goal_create_fallback' ? 'goal_create_fallback' : 'goals';

  const [goalText, setGoalText] = useState(
    typeof params.goalText === 'string' ? params.goalText : '',
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pkg, setPkg] = useState<AIGoalPackage | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Authed-screen guard: bounce a signed-out session like other authed screens.
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/auth/signin');
    }
  }, [initialized, user, router]);

  // FU-5 hollow card language for the exhausted panel.
  const panelWash = useMemo(
    () => applyOpacity(c.forest, theme === 'dark' ? 0.1 : 0.07),
    [c.forest, theme],
  );
  const panelBorder = useMemo(() => applyOpacity(c.accent, 0.55), [c.accent, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const tooShort = goalText.trim().length < MIN_GOAL_LENGTH;

  const handleGenerate = useCallback(async () => {
    if (!user?.id) return;
    setAiLoading(true);
    setAiError(null);

    const result = await generateGoalPackage(goalText.trim());
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
  }, [user?.id, goalText, source]);

  const handleManualInstead = useCallback(() => {
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
          // Soft cap surface — never a hard wall.
          Alert.alert('Two goals at a time', GOAL_LIMIT_MESSAGE, [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Livra+', onPress: () => router.push('/paywall') },
          ]);
        } else {
          Alert.alert('Error', 'Could not save goal. Please try again.');
        }
        logger.error('[suggest] confirm failed:', err);
      } finally {
        setConfirming(false);
      }
    },
    [user?.id, pkg, goalText, source, router],
  );

  return {
    theme,
    c,
    router,
    goalText,
    setGoalText,
    aiLoading,
    aiError,
    exhausted,
    pkg,
    confirming,
    panelWash,
    panelBorder,
    tooShort,
    handleGenerate,
    handleManualInstead,
    handleDismissReview,
    handleConfirm,
  };
}
