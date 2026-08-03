import { NativeModules } from 'react-native';
import PackagedHealthKit from 'react-native-health';

/**
 * Resolves the HealthKit native module WITHOUT trusting react-native-health's
 * own export.
 *
 * The package's index.js builds its export with
 * `Object.assign({}, NativeModules.AppleHealthKit, { Constants })` — a copy by
 * property ENUMERATION. Under the New Architecture (which every EAS build runs:
 * build 63's pod install logs "Configuring the target with the New
 * Architecture" despite app.json's `newArchEnabled: false`, an option
 * expo-build-properties 56 no longer has), `NativeModules` is the bridgeless
 * `global.nativeModuleProxy`, and the module objects it hands back do not
 * enumerate their methods. The copy therefore contains ONLY `Constants`,
 * `initHealthKit` is lost, and the app concluded the module was missing —
 * "Apple Health isn't available on this device" on a phone where the pod was
 * compiled in.
 *
 * Direct property access straight off `NativeModules.AppleHealthKit` goes
 * through the proxy's `get` and works — the same mechanism the widget's
 * react-native-shared-group-preferences uses on device today. So: prefer the
 * direct module, fall back to the packaged export (old architecture, Jest),
 * and report unavailable only when neither carries `initHealthKit`.
 */
export interface HealthNativeModule {
  initHealthKit(
    options: { permissions: { read: string[]; write: string[] } },
    callback: (error: string) => void,
  ): void;
  getSamples(options: unknown, callback: (err: unknown, results: any[]) => void): void;
  getSleepSamples(options: unknown, callback: (err: unknown, results: any[]) => void): void;
  getWaterSamples(options: unknown, callback: (err: unknown, results: any[]) => void): void;
  getMindfulSession(options: unknown, callback: (err: unknown, results: any[]) => void): void;
  getDailyStepCountSamples(
    options: unknown,
    callback: (err: unknown, results: any[]) => void,
  ): void;
}

function hasInitHealthKit(candidate: unknown): candidate is HealthNativeModule {
  return (
    candidate != null &&
    typeof (candidate as { initHealthKit?: unknown }).initHealthKit === 'function'
  );
}

export function getHealthNative(): HealthNativeModule | null {
  const direct = (NativeModules as Record<string, unknown>).AppleHealthKit;
  if (hasInitHealthKit(direct)) return direct;
  if (hasInitHealthKit(PackagedHealthKit)) return PackagedHealthKit;
  return null;
}

/**
 * Names which probe failed, so a device report of the "isn't available" toast
 * arrives with evidence instead of a guess (the logger is local-only; this
 * string is all the forensics a TestFlight session leaves behind).
 */
export function describeHealthNativeAbsence(): string {
  const direct = (NativeModules as Record<string, unknown>).AppleHealthKit;
  const packagedKeys = PackagedHealthKit
    ? Object.keys(PackagedHealthKit as object).join(',') || '(none enumerable)'
    : '(no export)';
  return `NativeModules.AppleHealthKit=${direct == null ? 'missing' : 'present without initHealthKit'}; packaged export keys: ${packagedKeys}`;
}
