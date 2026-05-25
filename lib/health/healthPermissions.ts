import AppleHealthKit from 'react-native-health';
import { HEALTH_KIT_PERMISSIONS } from './healthTypes';
import type { HealthKitType } from './healthTypes';

export async function requestPermissions(types: HealthKitType[]): Promise<void> {
  const readPermissions = Array.from(
    new Set(types.flatMap(t => HEALTH_KIT_PERMISSIONS[t])),
  );

  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(
      { permissions: { read: readPermissions as any[], write: [] } },
      (error: string) => {
        if (error) { reject(new Error(error)); return; }
        resolve();
      },
    );
  });
}

export async function hasPermissions(_types: HealthKitType[]): Promise<boolean> {
  // iOS does not expose denied state — treat this as "try and see"
  return true;
}
