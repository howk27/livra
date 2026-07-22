/**
 * Classifies a validate-iap-receipt failure into the client's retry contract:
 * `invalid` = permanent, stop and finish the transaction; `transient` = retry.
 *
 * WHY THIS IS A SEPARATE MODULE: supabase-js raises FunctionsHttpError for ANY
 * non-2xx response and leaves `data` null, so the server's own reason string
 * only reaches the client if the caller reads the body off `error.context`.
 * Before that was done, every permanent rejection (409 already_linked, 400
 * invalid/expired/revoked) was indistinguishable from a 500 and the client
 * retried a condition that can never clear. Keeping the decision pure means it
 * is testable without a network or a Supabase client.
 */

/** Reason substrings the server uses for conditions that will never clear. */
export const PERMANENT_REASON_SIGNALS = [
  'invalid',
  'expired',
  'revoked',
  'not_purchased',
  'mismatched',
  'already_linked',
] as const;

/**
 * Permanent regardless of body. 403 = the JWT subject is not the claimed user,
 * 409 = this Apple subscription is bound to a different Livra account.
 */
const PERMANENT_STATUSES = new Set([403, 409]);

/**
 * Always worth retrying even when the body reads permanent-ish. 401 belongs
 * here and NOT in the set above: a stale access token is refreshable, and
 * `verify_jwt = true` means the gateway 401s before the function ever runs.
 */
const TRANSIENT_STATUSES = new Set([401, 408, 429]);

export type ValidationFailure = {
  status: 'invalid' | 'transient';
  reason: string;
};

export function classifyValidationFailure(input: {
  httpStatus?: number;
  serverReason?: string | null;
}): ValidationFailure {
  const reason =
    (input.serverReason ?? '').trim() ||
    (input.httpStatus !== undefined ? `http_${input.httpStatus}` : 'non_success');

  if (input.httpStatus !== undefined) {
    if (TRANSIENT_STATUSES.has(input.httpStatus)) return { status: 'transient', reason };
    if (PERMANENT_STATUSES.has(input.httpStatus)) return { status: 'invalid', reason };
  }

  const lower = reason.toLowerCase();
  const isPermanent = PERMANENT_REASON_SIGNALS.some((signal) => lower.includes(signal));
  return isPermanent ? { status: 'invalid', reason } : { status: 'transient', reason };
}
