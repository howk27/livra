// Recovery deep links are a session-swap primitive.
//
// Any URL matching `auth/reset-password` that carries a valid recovery fragment
// gets `setSession`'d, which installs whatever account the tokens belong to.
// GoTrue validates the tokens, so this can never FORGE an identity — but it can
// sign the device into the ATTACKER'S account (a login-CSRF shape). From there
// the victim's next journal entry, goal or check-in lands in a mailbox someone
// else controls.
//
// Founder ruling 2026-08-08: confirm, do not refuse. Resetting a second account
// on your own device is a real workflow, so the gate names both accounts and
// asks — it does not close the door.
//
// This module is PURE and holds no Supabase or React dependency, so the rule can
// be tested without a session, a navigator or an overlay host.

/** What a recovery token claims about who it belongs to. Unverified by design. */
export interface RecoveryTokenIdentity {
  /** The `sub` claim — the auth user's uuid. */
  userId: string | null;
  /** The `email` claim, when GoTrue included one. Display only. */
  email: string | null;
}

/**
 * Read the `sub` and `email` claims out of a JWT WITHOUT verifying its
 * signature.
 *
 * That is safe here and nowhere else: this value never grants anything. It is
 * used only to decide whether to ASK the user a question, and the token still
 * has to survive `setSession` — where GoTrue does the real verification —
 * before any session exists. Treating an unverified claim as an authorization
 * input would be a hole; treating it as a hint for a confirmation prompt is
 * not.
 *
 * Returns nulls rather than throwing: a token we cannot read is a token we
 * cannot compare, and the caller's job is then to fall back to the safe branch.
 */
export function readRecoveryTokenIdentity(accessToken: string): RecoveryTokenIdentity {
  const empty: RecoveryTokenIdentity = { userId: null, email: null };
  try {
    const segments = accessToken.split('.');
    if (segments.length < 2) return empty;

    // base64url -> base64, then pad to a multiple of 4.
    let payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    payload += '='.repeat((4 - (payload.length % 4)) % 4);

    const json: unknown = JSON.parse(atob(payload));
    if (typeof json !== 'object' || json === null) return empty;

    const claims = json as { sub?: unknown; email?: unknown };
    return {
      userId: typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null,
      email: typeof claims.email === 'string' && claims.email.length > 0 ? claims.email : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Does installing this recovery session need the user's say-so first?
 *
 * TRUE only when a DIFFERENT account is already signed in. The cases and why:
 *
 * - No one signed in -> false. Nothing to lose; this is the ordinary reset.
 * - Same account -> false. Resetting your own password from your own device is
 *   the flow this feature exists for; a prompt there is pure friction.
 * - Different account -> TRUE. This is the swap worth asking about.
 * - Incoming identity unreadable -> TRUE whenever someone is signed in. We
 *   cannot prove it is the same person, and the whole point of the gate is that
 *   an unprovable swap is the dangerous one. Erring toward the prompt costs a
 *   tap; erring the other way is the vulnerability.
 */
export function shouldConfirmRecoverySwap(
  currentUserId: string | null | undefined,
  incomingUserId: string | null | undefined
): boolean {
  if (!currentUserId) return false;
  if (!incomingUserId) return true;
  return currentUserId !== incomingUserId;
}

/**
 * Copy for the prompt. Names BOTH sides — a confirmation that does not say
 * which account you are leaving and which you are entering is not informed
 * consent, it is a speed bump.
 */
export function recoverySwapConfirmCopy(
  currentEmail: string | null | undefined,
  incomingEmail: string | null | undefined
): { title: string; message: string; confirmLabel: string; cancelLabel: string } {
  const leaving = currentEmail?.trim() || 'the account you are signed in to';
  const entering = incomingEmail?.trim() || 'a different account';
  return {
    title: 'Switch accounts?',
    message:
      `This password reset link is for ${entering}, but you are signed in as ${leaving}. ` +
      `Continuing signs you out of ${leaving} on this device.`,
    confirmLabel: 'Switch accounts',
    cancelLabel: 'Stay signed in',
  };
}
