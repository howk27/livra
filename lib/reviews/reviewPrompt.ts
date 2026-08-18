import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

/**
 * The App Store rating ask.
 *
 * Livra had no `requestReview` call anywhere before this (audit, 16 Aug 2026),
 * which is why the app sat at 0 ratings six months after launch. Ratings are
 * not vanity here: App Store search ranking is fed by conversion, and a
 * 0-rating product page converts badly, so the missing prompt was throttling
 * discovery.
 *
 * Placement is deliberate. The ask fires once the goal-completion overlay has
 * finished its exit — the single moment the app has earned the right to ask,
 * because the user just finished something. It is unreachable from onboarding
 * by construction: the overlay only mounts on a goal → 'completed' transition.
 *
 * Two throttles stack. Ours (120 days) keeps a prolific finisher from being
 * asked every time they close a goal. Apple's own limit (3 prompts per user per
 * 365 days) is invisible to us and may silently show nothing at all — which is
 * exactly why we burn our slot on the attempt, not on a confirmed display.
 */

/** Epoch ms of the last time we ASKED iOS for the prompt (not the last time one was shown). */
export const REVIEW_PROMPT_LAST_ASKED_KEY = 'livra_review_prompt_last_asked_v1';

/** Our self-throttle. Deliberately far wider than Apple's 3-per-365d cap. */
export const REVIEW_PROMPT_MIN_INTERVAL_MS = 120 * 24 * 60 * 60 * 1000;

/** Lets the overlay's exit spring land before the system sheet slides over it. */
export const REVIEW_PROMPT_DELAY_MS = 700;

/**
 * Whether we are allowed to ask right now.
 *
 * Fails closed: if storage or the store-review module throws, we decline. An
 * unprovable throttle must never become an un-throttled prompt.
 */
export async function shouldRequestReview(now: number = Date.now()): Promise<boolean> {
  try {
    // The 700ms delay is long enough for the user to background the app, and
    // iOS will not draw a review sheet over a backgrounded app. Because the
    // timestamp is written before the ask (deliberately), firing here would
    // burn 120 days on a prompt nobody saw. Apple's 3/365 cap is invisible to
    // us; this one is not, so decline and take the next completion instead.
    if (AppState.currentState !== 'active') return false;

    if (!(await StoreReview.hasAction())) return false;

    const raw = await AsyncStorage.getItem(REVIEW_PROMPT_LAST_ASKED_KEY);
    if (!raw) return true;

    const last = Number(raw);
    // A corrupt value must not lock the user out of ever being asked again.
    if (!Number.isFinite(last)) return true;

    return now - last >= REVIEW_PROMPT_MIN_INTERVAL_MS;
  } catch (e) {
    logger.debug('[Review] gate check failed', e);
    return false;
  }
}

/**
 * Ask, if the gate allows. Resolves true when the request was actually issued.
 *
 * The timestamp is written BEFORE the call on purpose. `requestReview` resolves
 * whether or not iOS drew anything, so waiting for "success" would mean a user
 * who is over Apple's cap gets re-asked on every single goal completion.
 */
export async function maybeRequestReview(now: number = Date.now()): Promise<boolean> {
  if (!(await shouldRequestReview(now))) return false;

  try {
    await AsyncStorage.setItem(REVIEW_PROMPT_LAST_ASKED_KEY, String(now));
    await StoreReview.requestReview();
    return true;
  } catch (e) {
    logger.debug('[Review] requestReview failed', e);
    return false;
  }
}

/** Fire-and-forget, delayed so it never fights the overlay's exit animation. */
export function scheduleReviewPrompt(delayMs: number = REVIEW_PROMPT_DELAY_MS): void {
  setTimeout(() => {
    void maybeRequestReview();
  }, delayMs);
}
