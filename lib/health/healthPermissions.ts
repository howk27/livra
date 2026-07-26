import AppleHealthKit from 'react-native-health';
import { HEALTH_KIT_PERMISSIONS } from './healthTypes';
import type { HealthKitType } from './healthTypes';

export async function requestPermissions(types: HealthKitType[]): Promise<void> {
  const readPermissions = Array.from(
    new Set(types.flatMap(t => HEALTH_KIT_PERMISSIONS[t])),
  );

  // A missing native module is a different failure from a refused
  // authorization, and the two used to arrive at the UI as one sentence. This
  // one is worth naming: it means the build lacks the HealthKit pod or the
  // entitlement, which no amount of tapping in iOS Settings will fix.
  if (!AppleHealthKit || typeof AppleHealthKit.initHealthKit !== 'function') {
    throw new Error('Apple Health is not available in this build (native module missing)');
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
