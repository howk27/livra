import { paywallAutoCloseStep } from '../../lib/iap/paywallAutoClose';

/**
 * Device report 2026-07-25: "Premium screen won't stay open. These need to open
 * and stay open — users will manage their membership through here."
 *
 * The screen already had a transition witness meant to close only on a
 * mid-session unlock. It armed on `!isProUnlocked`, and `useIapSubscriptions`
 * initialises `isProUnlocked` to false with `proStatus.status = 'unknown'`
 * while the entitlement is still being resolved. So a subscriber's FIRST render
 * looked exactly like a locked one, the witness armed, the entitlement then
 * resolved to true, and the screen closed itself — every time.
 *
 * The witness has to arm on a RESOLVED locked reading. `checkProStatus`
 * returns 'locked' only as an answer (signed out, or the DB says not unlocked)
 * and 'unknown' whenever it could not resolve, so 'locked' is that signal.
 */
describe('paywallAutoCloseStep', () => {
  it('does not arm while the entitlement is still unresolved', () => {
    expect(
      paywallAutoCloseStep({
        proStatus: { status: 'unknown' },
        isProUnlocked: false,
        sawResolvedLock: false,
      })
    ).toBe('idle');
  });

  it('THE REGRESSION: a subscriber opening the screen is never closed out of it', () => {
    // frame 1 — hook defaults, entitlement not resolved yet
    const first = paywallAutoCloseStep({
      proStatus: { status: 'unknown' },
      isProUnlocked: false,
      sawResolvedLock: false,
    });
    expect(first).toBe('idle');

    // frame 2 — entitlement resolves: they were Pro all along
    const second = paywallAutoCloseStep({
      proStatus: { status: 'unlocked' },
      isProUnlocked: true,
      sawResolvedLock: first === 'arm',
    });
    expect(second).toBe('idle');
  });

  it('arms on a resolved locked reading', () => {
    expect(
      paywallAutoCloseStep({
        proStatus: { status: 'locked' },
        isProUnlocked: false,
        sawResolvedLock: false,
      })
    ).toBe('arm');
  });

  it('closes on the mid-session unlock it actually witnessed', () => {
    expect(
      paywallAutoCloseStep({
        proStatus: { status: 'unlocked' },
        isProUnlocked: true,
        sawResolvedLock: true,
      })
    ).toBe('close');
  });

  it('stays open when the entitlement can never be resolved (offline)', () => {
    expect(
      paywallAutoCloseStep({
        proStatus: { status: 'unknown' },
        isProUnlocked: true,
        sawResolvedLock: false,
      })
    ).toBe('idle');
  });

  it('re-arming is harmless — a locked reading while already armed still arms', () => {
    expect(
      paywallAutoCloseStep({
        proStatus: { status: 'locked' },
        isProUnlocked: false,
        sawResolvedLock: true,
      })
    ).toBe('arm');
  });
});
