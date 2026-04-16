import type { User } from '@supabase/supabase-js';

function readAppMeta(user: User): Record<string, unknown> | undefined {
  return user.app_metadata as Record<string, unknown> | undefined;
}

/** True when metadata explicitly indicates Apple (or only Apple in providers list). */
function isAppleOnlyFromMetadata(user: User): boolean {
  const meta = readAppMeta(user);
  if (!meta) return false;
  if (meta.provider === 'apple') return true;
  const list = meta.providers;
  if (Array.isArray(list)) {
    const hasApple = list.includes('apple');
    const hasEmail = list.includes('email');
    if (hasApple && !hasEmail) return true;
  }
  return false;
}

/**
 * True if we can confidently treat the account as Apple-sign-in-only (no email/password identity).
 * Used to avoid offering password re-auth / change-password for OAuth-only users.
 */
function isAppleOnlyUser(user: User): boolean {
  const identities = user.identities ?? [];
  if (identities.some((i) => i.provider === 'email')) {
    return false;
  }
  if (identities.some((i) => i.provider === 'apple')) {
    return true;
  }
  return isAppleOnlyFromMetadata(user);
}

function providersFromAppMetadata(user: User): boolean {
  const meta = readAppMeta(user);
  if (!meta) return false;
  const list = meta.providers;
  if (Array.isArray(list) && list.some((p) => p === 'email')) return true;
  if (meta.provider === 'email') return true;
  return false;
}

/**
 * True if email/password re-auth is appropriate (signInWithPassword + change password).
 *
 * Order: reject explicit Apple-only → accept explicit email identity → metadata → sparse JWT fallback.
 * Sparse fallback: some sessions omit `identities` but email users still have `user.email` and are not Apple-only.
 */
export function userHasEmailPasswordIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isAppleOnlyUser(user)) return false;

  const identities = user.identities;
  if (identities?.length) {
    return identities.some((i) => i.provider === 'email');
  }

  if (providersFromAppMetadata(user)) return true;

  const email = user.email;
  if (typeof email === 'string' && email.includes('@')) {
    // Apple Hide My Email — without explicit `email` identity, do not assume password auth exists.
    if (/@privaterelay\.appleid\.com$/i.test(email.trim())) {
      return false;
    }
    return true;
  }

  return false;
}

/** User-facing hint when password-based flows are not applicable. */
export function passwordCredentialNotApplicableMessage(): string {
  return 'You signed in with Apple (or another provider). Password changes and password re-verification are only available for accounts that use email and password. To manage your Apple ID, use Settings → Apple ID on your device.';
}
