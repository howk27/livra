/**
 * Founder ruling 2026-08-08: the goal-completion share card is HIDDEN and does
 * not ship in V2.
 *
 * Nothing is deleted — GoalCompletionShareCard, SharePreviewModal,
 * generateShareCard, the theme palettes and the shareCard store all remain
 * intact and tested. This is the single seam that decides whether the feature
 * is reachable: flip it to `true` and both entry points (the completion
 * overlay's "Share your win" and /goal/complete's "Share this moment") come
 * back exactly as they were.
 *
 * Deliberately a compile-time constant, NOT a lib/experiments/flags entry:
 * those default to `env.isDev`, hydrate asynchronously from AsyncStorage and
 * can be overridden on a user's device. A hidden feature must not be one
 * storage write away from being live, and must not flash in during hydration.
 *
 * Known open issue to resolve BEFORE re-enabling (2026-08-08, arithmetic only,
 * never seen on a device): the card is 16:9 — 219pt tall at a 390pt width —
 * and its default content (wordmark + 40pt title + italic line + up to four
 * meta lines + footer) measures ~177pt against ~122pt of available body
 * height. React Native children do not shrink by default and
 * adjustsFontSizeToFit only shrinks the title within its own box, so the meta
 * stack is expected to overflow the card bounds that generateShareCard
 * captures.
 */
export const SHARE_CARD_ENABLED = false;
