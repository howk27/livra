import AppleHealthKit from 'react-native-health';
import { HEALTH_KIT_PERMISSIONS } from './healthTypes';
import type { HealthKitType } from './healthTypes';

/**
 * The build cannot talk to HealthKit at all — the pod or the entitlement is
 * missing. Distinct from a refused authorization, and the distinction is the
 * whole point: no amount of tapping in iOS Settings fixes this one, so the copy
 * for it must not send the user looking. Carried as a `code` rather than checked
 * with `instanceof`, so it survives any boundary that reshapes the error.
 */
export const HEALTH_UNAVAILABLE = 'health/unavailable';

export class HealthUnavailableError extends Error {
  readonly code = HEALTH_UNAVAILABLE;
  constructor() {
    super('Apple Health is not available in this build (native module missing)');
    this.name = 'HealthUnavailableError';
  }
}

export function isHealthUnavailable(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { code?: unknown }).code === HEALTH_UNAVAILABLE
  );
}

export async function requestPermissions(types: HealthKitType[]): Promise<void> {
  const readPermissions = Array.from(
    new Set(types.flatMap(t => HEALTH_KIT_PERMISSIONS[t])),
  );

  // A missing native module is a different failure from a refused
  // authorization, and the two used to arrive at the UI as one sentence. This
  // one is worth naming: it means the build lacks the HealthKit pod or the
  // entitlement, which no amount of tapping in iOS Settings will fix.
  if (!AppleHealthKit || typeof AppleHealthKit.initHealthKit !== 'function') {
    throw new HealthUnavailableError();
  }

  return new Promise((resolve, reject) => {
    try {
      AppleHealthKit.initHealthKit(
        { permissions: { read: readPermissions as any[], write: [] } },
        (error: string) => {
          if (error) { reject(new Error(error)); return; }
          resolve();
        },
      );
    } catch (e) {
      // initHealthKit throwing synchronously never reached the callback, so the
      // promise hung rather than rejecting.
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function hasPermissions(_types: HealthKitType[]): Promise<boolean> {
  // iOS does not expose denied state — treat this as "try and see"
  return true;
}
