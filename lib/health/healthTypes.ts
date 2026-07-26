export type HealthKitType =
  | 'workout'
  | 'sleep'
  | 'hydration'
  | 'mindful'
  | 'steps'
  | 'running';

/**
 * These strings are react-native-health's JS permission names
 * (HealthPermission in its index.d.ts) — NOT HealthKit's own
 * HKQuantityTypeIdentifier* names. The native bridge resolves each string to an
 * HKObjectType and SILENTLY SKIPS anything it does not recognise
 * (getReadPermsFromOptions drops a nil lookup), so a wrong name never raises:
 * the permission is simply never requested and the read returns nothing
 * forever.
 *
 * That is exactly what 'DietaryWater' was doing here. It is the ObjC identifier
 * used inside the library; the JS-facing name is 'Water'. Hydration permission
 * has therefore never once been asked for. Verified against
 * node_modules/react-native-health/index.d.ts (2026-07-25).
 *
 * tests/unit/healthPermissionNames.test.ts pins every name to that enum.
 */
export const HEALTH_KIT_PERMISSIONS: Record<HealthKitType, string[]> = {
  workout:   ['Workout'],
  sleep:     ['SleepAnalysis'],
  hydration: ['Water'],
  mindful:   ['MindfulSession'],
  steps:     ['StepCount'],
  running:   ['Workout', 'DistanceWalkingRunning'],
};
