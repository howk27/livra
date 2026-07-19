/**
 * Resolve the initial display name for the profile edit screen.
 *
 * Precedence (FU-4): profiles.display_name from the DB, then the auth
 * metadata captured at signup (`display_name`, then `full_name`).
 * Returns '' only when no name exists anywhere, so the screen presents
 * an empty field only for genuinely name-less users.
 */
export function resolveInitialDisplayName(
  profileDisplayName: string | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined
): string {
  if (typeof profileDisplayName === 'string' && profileDisplayName.trim()) {
    return profileDisplayName.trim();
  }
  const meta = userMetadata ?? {};
  for (const key of ['display_name', 'full_name'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

/**
 * Apple "Hide My Email" hands us a relay address whose local part is an opaque
 * token (e.g. a1b2c3d4@privaterelay.appleid.com) — it is not a name and must
 * never surface as one. Such users are treated as name-less: the greeting drops
 * the {name} slot gracefully, and they can set a real name in Settings.
 */
function isPrivateRelayEmail(email?: string | null): boolean {
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase().endsWith('@privaterelay.appleid.com')
  );
}

/**
 * First name for voice/greeting {name} slots (PL-4): first word of the
 * resolved display name, falling back to the email prefix. Null when no name
 * exists anywhere — the moment engine drops the slot gracefully. Apple
 * hide-my-email relay tokens are never used as a name.
 */
export function resolveFirstName(
  userMetadata: Record<string, unknown> | null | undefined,
  email?: string | null
): string | null {
  const named = resolveInitialDisplayName(null, userMetadata);
  if (named) return named.split(' ')[0] || null;
  if (isPrivateRelayEmail(email)) return null;
  const prefix = email?.split('@')[0] || '';
  return prefix.split(' ')[0] || null;
}
