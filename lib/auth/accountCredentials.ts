/**
 * Pure logic behind the credential blocks of Edit Profile
 * (app/settings/profile.tsx): which credentials an account actually has,
 * whether the new values are usable, and what honestly happened after Supabase
 * answered.
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
 * Apple/OAuth only accounts have none: there is nothing to reauthenticate
 * against, so those accounts get the ADD form (validateNewPassword) instead of
 * the CHANGE form, rather than being asked for a password they never set.
 */
export function hasPasswordIdentity(user?: CredentialUser | null): boolean {
  return authProviders(user).includes('email');
}

export interface NewPasswordInput {
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordChangeInput extends NewPasswordInput {
  currentPassword: string;
}

/**
 * The ADD-a-password path: an account with no password identity has nothing to
 * verify, so no current password is asked for or checked here.
 */
export function validateNewPassword({
  newPassword,
  confirmPassword,
}: NewPasswordInput): string | null {
  if (!newPassword) return 'Enter a new password.';
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword !== confirmPassword) return 'The two new passwords do not match.';
  return null;
}

/**
 * The CHANGE path: the current password is mandatory because the screen
 * reauthenticates with it before writing (updateUser never checks it).
 * Returns the first problem with the entered passwords, or null when usable.
 */
export function validatePasswordChange({
  currentPassword,
  newPassword,
  confirmPassword,
}: PasswordChangeInput): string | null {
  if (!currentPassword.trim()) return 'Enter your current password first.';
  const problem = validateNewPassword({ newPassword, confirmPassword });
  if (problem) return problem;
  if (newPassword === currentPassword) return 'That is already your password. Pick a different one.';
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

/**
 * Founder decision 2026-07-24: which fields a password protects.
 *
 * Email is the account RECOVERY channel: whoever controls it can request a
 * password reset and take the account. Supabase's updateUser({email}) checks
 * no password of its own, so without this an unlocked phone is enough. Hence
 * a change of email reauthenticates first, exactly as a password change does.
 *
 * Name and avatar are NOT gated: they are display preferences, not access
 * paths, and an Apple-only account has no password to demand, so gating them
 * would lock those users out of their own profile.
 *
 * Accounts with no password identity (Apple/OAuth) cannot answer THIS check.
 * CORRECTED 2026-07-25: they used to be waved through on the belief that
 * Supabase's confirmation link gated them. It does not on this project, which
 * auto-confirms. See emailChangeReauthMethod below for what actually gates them.
 */
export function emailChangeRequiresPassword(user?: CredentialUser | null): boolean {
  return hasPasswordIdentity(user);
}

/** How an account can prove ownership before its email, its recovery channel, moves. */
export type EmailChangeReauthMethod = 'password' | 'apple' | 'none';

/**
 * VERIFIED LIVE 2026-07-25: this project runs with "Confirm email" OFF, so
 * Supabase auto-confirms (every signup since mid-June has email_confirmed_at
 * within ~50ms of created_at) and no confirmation mail is sent. That removes
 * the gate the comment above assumed for Apple-only accounts: with no password
 * to reauthenticate and no link to click, an unlocked phone was enough to move
 * the recovery channel, and enabling "Secure email change" cannot help while
 * confirmations stay off.
 *
 * So an Apple account proves ownership the only way it can: a fresh Sign in
 * with Apple. The caller must also check the returned identity is the SAME
 * user, because signInWithIdToken with a different Apple ID signs into that
 * other account rather than proving anything about this one.
 */
export function emailChangeReauthMethod(user?: CredentialUser | null): EmailChangeReauthMethod {
  if (hasPasswordIdentity(user)) return 'password';
  if (authProviders(user).includes('apple')) return 'apple';
  return 'none';
}

export interface EmailChangeRequest {
  nextEmail: string;
  currentEmail?: string | null;
  currentPassword: string;
  requiresPassword: boolean;
}

/**
 * Returns the first problem with an email-change request, or null when it is
 * usable. Wraps validateEmailChange with the reauth precondition so the screen
 * has one call to make.
 */
export function validateEmailChangeRequest({
  nextEmail,
  currentEmail,
  currentPassword,
  requiresPassword,
}: EmailChangeRequest): string | null {
  const problem = validateEmailChange(nextEmail, currentEmail);
  if (problem) return problem;
  if (requiresPassword && !currentPassword.trim()) {
    return 'Enter your current password to change your email.';
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

/**
 * A password rejected for being in a known breach corpus, NOT for being short.
 *
 * Supabase's leaked-password protection (HaveIBeenPwned) was enabled on this
 * project 2026-08-03 and answers `weak_password` with "Password is known to be
 * weak and easy to guess". That string contains "weak", so it fell into the
 * length branch below and the app told the user to make the password LONGER.
 * That advice cannot work, because length is not why it was refused: a user who
 * pads a breached password still gets refused, with the same message, forever.
 *
 * MUST be tested before the length branch for exactly that reason.
 */
function isBreachedPasswordError(t: string): boolean {
  return /known to be weak|easy to guess|pwned|breach|compromised/.test(t);
}

export function mapPasswordChangeError(error?: AuthErrorLike | null): string {
  const t = text(error);
  if (/should be different|same_password|different from the old/.test(t)) {
    return 'That is already your password. Pick a different one.';
  }
  if (isBreachedPasswordError(t)) {
    // Name the real reason. "It works on my other sites" is the symptom of the
    // problem, not evidence against it.
    return 'That password has appeared in a known data breach, so it is not safe to use here. Pick one you have not used elsewhere.';
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
