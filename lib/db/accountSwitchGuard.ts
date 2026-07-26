// The sign-IN side of the local-data purge.
//
// WHY THIS EXISTS: `purgeLocalUserData` runs inside `signOut`, which assumes the
// sign-out actually completes. Two paths skip it entirely — the app being killed
// mid-sign-out, and any session change that replaces the user without going
// through our `signOut` (a session restored for a different account, a deep-link
// auth, a token exchange). In both, the previous account's marks, goals, notes
// and identity memory are still on the device when the next person signs in, and
// the whole point of the purge is that this cannot happen.
//
// So the device also records WHO it last belonged to, and checks that on the way
// in. Sign-out remains the primary path; this is the guard for when sign-out did
// not get its chance.
//
// THE DANGEROUS MISTAKE, and why the null case is explicit: if no id is stored,
// we must NOT purge. Every existing install upgrading to this build has no
// stored id and local data that belongs to the person currently signed in —
// purging on "unknown" would delete the data of every user on first launch.
// Unknown means record, never wipe.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
// Static, not `await import()`: a runtime dynamic import cannot execute under
// Jest's VM (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG), and it silently took
// the catch branch instead — the purge looked wired and never ran. Nothing is
// loaded earlier than before, because useAuth already imports THIS module
// lazily, and the graph it pulls is the app's own stores.
import { purgeLocalUserData } from './purgeLocalUserData';

/**
 * The account this device's local data belongs to. Account-scoped (listed in
 * `ACCOUNT_SCOPED_STORAGE_KEYS`), so a clean sign-out removes it along with
 * everything else — which is correct: after a completed purge there is nothing
 * left to attribute.
 */
export const LAST_SIGNED_IN_USER_ID_KEY = 'livra_last_signed_in_user_id_v1';

export type AccountSwitchGuardResult =
  /** A different account's data was on the device; it has been wiped. */
  | { action: 'purged'; previousUserId: string; failures: string[] }
  /** Nothing was attributed to this device yet — recorded, deliberately not wiped. */
  | { action: 'recorded' }
  /** Same account as last time, or we could not tell. Nothing done. */
  | { action: 'unchanged' };

/**
 * Call on every authenticated session. Purges only when the device is KNOWN to
 * hold a different account's data.
 *
 * Never throws: an account switch must not be able to block sign-in.
 */
export async function guardAgainstAccountSwitch(
  userId: string,
): Promise<AccountSwitchGuardResult> {
  if (!userId) return { action: 'unchanged' };

  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY);
  } catch (error) {
    // Fail OPEN. If we cannot read who owns this data, wiping it is a guess we
    // are not entitled to make — the likeliest owner is the person signing in.
    logger.error('[AccountSwitch] could not read the last signed-in id; not purging:', error);
    return { action: 'unchanged' };
  }

  if (stored === userId) return { action: 'unchanged' };

  let failures: string[] = [];
  if (stored) {
    logger.warn('[AccountSwitch] a different account owns this device\'s local data — purging');
    try {
      ({ failures } = await purgeLocalUserData());
      if (failures.length > 0) {
        logger.error('[AccountSwitch] purge on sign-in incomplete:', failures);
      }
    } catch (error) {
      logger.error('[AccountSwitch] purge on sign-in failed:', error);
      failures = ['purge'];
    }
  }

  try {
    // AFTER the purge, always: the purge sweeps account-scoped keys and this is
    // one of them. Recorded even when the purge reported failures — leaving the
    // old id in place would re-run the purge on the NEXT launch, by which point
    // it would be deleting the new account's own synced data.
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, userId);
  } catch (error) {
    logger.error('[AccountSwitch] could not record the signed-in id:', error);
  }

  return stored ? { action: 'purged', previousUserId: stored, failures } : { action: 'recorded' };
}
