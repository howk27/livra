// M9 Phase 6 T4 — the recovery-session leash.
//
// The traced defect (founder device trace 2026-07-31): a password-reset link
// mints a FULL session (`livra://auth/reset-password#access_token=…&type=recovery`
// → setSession), and nothing forced a new password — dismiss the set-password
// screen or relaunch the app, and app/index.tsx routed the recovery session
// straight into the tabs. Anyone holding the emailed link owned the account
// without ever setting a password.
//
// This flag is armed the moment a recovery session is installed and cleared
// ONLY when updateUser({ password }) succeeds. app/index.tsx refuses to route
// an authenticated user anywhere but /auth/reset-password-complete while it is
// set. Persisted (AsyncStorage) so killing the app mid-reset does not shake
// the leash off; registered in ACCOUNT_SCOPED_STORAGE_KEYS so sign-out wipes
// it with the session it leashes.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export const RECOVERY_PENDING_STORAGE_KEY = 'livra-recovery-pending-v1';

/** In-memory mirror so a same-launch read never races the disk. Starts null =
 * unknown; hydrated on first read. */
let pending: boolean | null = null;

export async function markRecoveryPending(): Promise<void> {
  pending = true;
  // One retry (T4 security Medium): a single silently-failed write plus a kill
  // before clear() opens the leash on relaunch, because the read deliberately
  // fails open. Two failures in a row we accept and log — the in-memory mirror
  // still leashes THIS launch either way.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await AsyncStorage.setItem(RECOVERY_PENDING_STORAGE_KEY, '1');
      return;
    } catch (error) {
      if (attempt === 1) logger.error('[recoveryPending] persist failed twice:', error);
    }
  }
}

export async function clearRecoveryPending(): Promise<void> {
  pending = false;
  try {
    await AsyncStorage.removeItem(RECOVERY_PENDING_STORAGE_KEY);
  } catch (error) {
    logger.error('[recoveryPending] clear failed:', error);
  }
}

export async function isRecoveryPending(): Promise<boolean> {
  if (pending !== null) return pending;
  try {
    pending = (await AsyncStorage.getItem(RECOVERY_PENDING_STORAGE_KEY)) === '1';
  } catch (error) {
    // Fail OPEN here would unleash the session; fail CLOSED would lock a
    // healthy user out of the app on a bad disk read. The flag exists to stop
    // a link-holder cruising into the tabs, and a healthy device rereads on
    // next launch — treat unknown as not-pending but say so loudly.
    logger.error('[recoveryPending] read failed — treating as not pending:', error);
    pending = false;
  }
  return pending;
}

/**
 * Forget the mirror WITHOUT asserting a value — the next read goes to disk.
 *
 * For the purge (QC-1061 item 2). The storage key is purge-registered, but the
 * mirror short-circuits `isRecoveryPending`, so within one app launch a
 * sign-out left a stale `true` behind and app/index.tsx bounced the NEXT
 * account to set-a-password with no reset session behind it — the leash
 * outliving the session it exists to leash.
 *
 * Deliberately `null`, not `false`: if the key sweep failed, disk still says
 * armed and the next read re-arms. That errs toward keeping the leash on,
 * which is the safe direction for a security gate.
 */
export function forgetRecoveryPendingMirror(): void {
  pending = null;
}

/** Test seam: forget the in-memory mirror. */
export function __resetRecoveryPendingForTests(): void {
  pending = null;
}
