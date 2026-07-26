/**
 * When the paywall may close itself.
 *
 * Founder 2026-07-23 and again 2026-07-25: the paywall is PERSISTENT. Settings →
 * Subscription opens it so a subscriber can check and manage their membership,
 * and it must stay open while they do. The only auto-close is the mid-session
 * unlock — a purchase or restore landing while the screen is watching — which
 * returns the user to what they were doing.
 *
 * The first attempt armed the witness on `!isProUnlocked`. That is not "locked",
 * it is "we have not resolved the entitlement yet": useIapSubscriptions starts
 * at isProUnlocked=false / proStatus.status='unknown' and resolves in an effect.
 * A subscriber's first frame was therefore indistinguishable from a free user's,
 * the witness armed, the resolve flipped isProUnlocked to true, and the screen
 * closed on them every single time.
 *
 * `checkProStatus` only answers 'locked' when it genuinely resolved a locked
 * account (signed out, or the DB says not unlocked); everything it could not
 * resolve is 'unknown'. So a resolved 'locked' is the honest witness, and the
 * failure direction is the safe one: if the entitlement can never be resolved
 * the screen simply stays open.
 */
export type PaywallProStatus = { status: 'unlocked' | 'locked' | 'unknown' };

export type PaywallAutoCloseDecision = 'arm' | 'close' | 'idle';

export function paywallAutoCloseStep(input: {
  proStatus: PaywallProStatus;
  isProUnlocked: boolean;
  sawResolvedLock: boolean;
}): PaywallAutoCloseDecision {
  if (input.proStatus.status === 'locked') return 'arm';
  if (input.isProUnlocked && input.sawResolvedLock) return 'close';
  return 'idle';
}
