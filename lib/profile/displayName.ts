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
 * First name for voice/greeting {name} slots (PL-4): first word of the
 * resolved display name, falling back to the email prefix. Null when no name
 * exists anywhere — the moment engine drops the slot gracefully.
 */
export function resolveFirstName(
  userMetadata: Record<string, unknown> | null | undefined,
  email?: string | null
): string | null {
  const full = resolveInitialDisplayName(null, userMetadata) || email?.split('@')[0] || '';
  return full.split(' ')[0] || null;
}
