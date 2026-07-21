/**
 * Pure logic behind the Sign-in screen (app/settings/account.tsx): which
 * credentials an account actually has, whether the new values are usable, and
 * what honestly happened after Supabase answered.
 *
 * Kept free of React and of the Supabase client so every rule here is unit
 * testable (tests/unit/accountCredentials.test.ts).
 */

/** Domain Apple hands out when a user hides their real address. */
export const APPLE_PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com';

/** Same floor app/auth/signin.tsx enforces at signup (validatePassword). */
export const MIN_PASSWORD_LENGTH = 8;

/** Same shape app/auth/signin.tsx validates with (validateEmail). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The slice of the Supabase user this module reads. */
export interface CredentialUser {
  email?: string | null;
  new_email?: string | null;
  identities?: ({ provider?: string | null } | null)[] | null;
  app_metadata?: { provider?: string | null; providers?: (string | null)[] | null } | null;
}

export function isApplePrivateRelayEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`);
}

/** Every sign-in provider attached to the account, deduped and lowercased. */
export function authProviders(user?: CredentialUser | null): string[] {
  const found = new Set<string>();
  for (const identity of user?.identities ?? []) {
    if (identity?.provider) found.add(identity.provider.toLowerCase());
  }
  const meta = user?.app_metadata;
  if (meta?.provider) found.add(meta.provider.toLowerCase());
  for (const provider of meta?.providers ?? []) {
    if (provider) found.add(provider.toLowerCase());
  }
  return [...found];
}

/**
 * True only when the account can actually be signed into with a password.
 * Apple/OAuth only accounts have none, so the change form must stay hidden for
 * them rather than failing at reauthentication.
 */
export function hasPasswordIdentity(user?: CredentialUser | null): boolean {
  return authProviders(user).includes('email');
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Returns the first problem with the entered passwords, or null when usable. */
export function validatePasswordChange({
  currentPassword,
  newPassword,
  confirmPassword,
}: PasswordChangeInput): string | null {
  if (!currentPassword.trim()) return 'Enter your current password first.';
  if (!newPassword) return 'Enter a new password.';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword === currentPassword) return 'That is already your password. Pick a different one.';
  if (newPassword !== confirmPassword) return 'The two new passwords do not match.';
  return null;
}

/** Returns the first problem with the entered email, or null when usable. */
export function validateEmailChange(nextEmail: string, currentEmail?: string | null): string | null {
  const next = nextEmail.trim();
  if (!next) return 'Enter the email you want to use.';
  if (!EMAIL_PATTERN.test(next)) return 'Please enter a valid email address.';
  if (currentEmail && next.toLowerCase() === currentEmail.trim().toLowerCase()) {
    return 'That is already your email.';
  }
  return null;
}

export type EmailChangeStatus = 'pending' | 'applied' | 'unknown';

export interface EmailChangeOutcome {
  status: EmailChangeStatus;
  message: string;
}

/**
 * Derives what really happened from the user Supabase returned, never from an
 * assumption. With "Confirm email" ON the returned user carries `new_email` and
 * nothing has changed yet. With it OFF the address is already swapped and no
 * mail was sent, so promising an inbox link would be a lie.
 */
export function describeEmailChangeOutcome(
  updated: CredentialUser | null | undefined,
  requestedEmail: string,
): EmailChangeOutcome {
  const requested = requestedEmail.trim().toLowerCase();
  const pendingEmail = updated?.new_email?.trim().toLowerCase();
  const currentEmail = updated?.email?.trim().toLowerCase();

  if (pendingEmail && pendingEmail === requested) {
    return {
      status: 'pending',
      message: `Confirm the link we sent to ${requestedEmail.trim()}. Your email stays the same until you do.`,
    };
  }
  if (currentEmail && currentEmail === requested) {
    return {
      status: 'applied',
      message: `Your email is now ${requestedEmail.trim()}.`,
    };
  }
  return {
    status: 'unknown',
    message: 'Your request went through. Check this screen in a moment to see which email is on file.',
  };
}

/** Pending address still waiting on a confirmation link, if there is one. */
export function pendingEmail(user?: CredentialUser | null): string | null {
  const next = user?.new_email?.trim();
  if (!next) return null;
  if (next.toLowerCase() === user?.email?.trim().toLowerCase()) return null;
  return next;
}

interface AuthErrorLike {
  message?: string | null;
  code?: string | null;
  status?: number | null;
}

function text(error?: AuthErrorLike | null): string {
  return `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
}

export function isEmailAlreadyInUseError(error?: AuthErrorLike | null): boolean {
  return /email_exists|already registered|already been registered|already in use|already exists/.test(
    text(error),
  );
}

export function mapEmailChangeError(error?: AuthErrorLike | null): string {
  const t = text(error);
  if (isEmailAlreadyInUseError(error)) return 'Another account already uses that email.';
  if (/rate|too many|429/.test(t)) return 'Too many tries just now. Give it a minute, then try again.';
  if (/network|fetch|timeout|offline/.test(t)) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  if (/invalid|valid email/.test(t)) return 'Please enter a valid email address.';
  return 'We could not change your email. Please try again.';
}

/** Failure of the re-sign-in that proves the current password. */
export function mapReauthError(error?: AuthErrorLike | null): string {
  const t = text(error);
  if (/invalid login credentials|invalid_credentials|invalid password/.test(t)) {
    return 'That current password is not right.';
  }
  if (/rate|too many|429/.test(t)) return 'Too many tries just now. Give it a minute, then try again.';
  if (/network|fetch|timeout|offline/.test(t)) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  return 'We could not confirm your current password. Please try again.';
}

export function mapPasswordChangeError(error?: AuthErrorLike | null): string {
  const t = text(error);
  if (/should be different|same_password|different from the old/.test(t)) {
    return 'That is already your password. Pick a different one.';
  }
  if (/weak|password_strength|at least/.test(t)) {
    return `Please choose a longer password · at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (/rate|too many|429/.test(t)) return 'Too many tries just now. Give it a minute, then try again.';
  if (/network|fetch|timeout|offline/.test(t)) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  return 'We could not change your password. Please try again.';
}
