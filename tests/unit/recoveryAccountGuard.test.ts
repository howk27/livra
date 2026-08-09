// A recovery deep link can install any account's session. This pins the rule
// that decides when the user is asked first (security-t4 follow-up, closed
// 2026-08-08 by founder ruling: confirm, do not refuse).

import {
  readRecoveryTokenIdentity,
  shouldConfirmRecoverySwap,
  recoverySwapConfirmCopy,
} from '@/lib/auth/recoveryAccountGuard';

const VICTIM = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const ATTACKER = 'a3e8ffaf-a013-41a4-a86b-572da101a04d';

/** A JWT with the given payload. Signature is nonsense on purpose — nothing
 *  here verifies it, and a test that signed it properly would be pretending
 *  this code does something it must never do. */
function jwt(payload: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.not-a-real-signature`;
}

describe('readRecoveryTokenIdentity', () => {
  it('reads sub and email out of a recovery token', () => {
    const token = jwt({ sub: ATTACKER, email: 'attacker@example.com', role: 'authenticated' });
    expect(readRecoveryTokenIdentity(token)).toEqual({
      userId: ATTACKER,
      email: 'attacker@example.com',
    });
  });

  it('survives base64url payloads that need padding', () => {
    // Payload lengths mod 4 of 2 and 3 both exercise the pad branch.
    for (const email of ['a@b.co', 'ab@c.com', 'abc@d.com']) {
      expect(readRecoveryTokenIdentity(jwt({ sub: VICTIM, email })).userId).toBe(VICTIM);
    }
  });

  it('returns nulls for garbage rather than throwing', () => {
    for (const bad of ['', 'not-a-jwt', 'only.two', 'a.!!!not-base64!!!.c']) {
      expect(readRecoveryTokenIdentity(bad)).toEqual({ userId: null, email: null });
    }
  });

  it('returns nulls when the payload carries no sub', () => {
    expect(readRecoveryTokenIdentity(jwt({ role: 'authenticated' }))).toEqual({
      userId: null,
      email: null,
    });
  });
});

describe('shouldConfirmRecoverySwap', () => {
  it('THE VULNERABILITY: a different account signed in must be confirmed', () => {
    expect(shouldConfirmRecoverySwap(VICTIM, ATTACKER)).toBe(true);
  });

  it('does not interrupt the ordinary reset — nobody signed in', () => {
    expect(shouldConfirmRecoverySwap(null, ATTACKER)).toBe(false);
    expect(shouldConfirmRecoverySwap(undefined, ATTACKER)).toBe(false);
  });

  it('does not interrupt resetting your OWN password on your own device', () => {
    expect(shouldConfirmRecoverySwap(VICTIM, VICTIM)).toBe(false);
  });

  it('asks when the incoming identity cannot be read and someone is signed in', () => {
    // Unreadable means unprovable, and an unprovable swap is the dangerous one.
    expect(shouldConfirmRecoverySwap(VICTIM, null)).toBe(true);
  });

  it('stays silent when the incoming identity is unreadable and nobody is signed in', () => {
    expect(shouldConfirmRecoverySwap(null, null)).toBe(false);
  });
});

describe('recoverySwapConfirmCopy', () => {
  it('names BOTH accounts, so the choice is informed', () => {
    const copy = recoverySwapConfirmCopy('me@example.com', 'attacker@example.com');
    expect(copy.message).toContain('me@example.com');
    expect(copy.message).toContain('attacker@example.com');
    expect(copy.confirmLabel).toBe('Switch accounts');
    expect(copy.cancelLabel).toBe('Stay signed in');
  });

  it('degrades to prose when an email is missing, never to "null"', () => {
    const copy = recoverySwapConfirmCopy(null, undefined);
    expect(copy.message).not.toMatch(/null|undefined/);
    expect(copy.message).toContain('a different account');
  });
});
