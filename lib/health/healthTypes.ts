export type HealthKitType =
  | 'workout'
  | 'sleep'
  | 'hydration'
  | 'mindful'
  | 'steps'
  | 'running';

export const HEALTH_KIT_PERMISSIONS: Record<HealthKitType, string[]> = {
  workout:   ['Workout'],
  sleep:     ['SleepAnalysis'],
  hydration: ['DietaryWater'],
  mindful:   ['MindfulSession'],
  steps:     ['StepCount'],
  running:   ['Workout', 'DistanceWalkingRunning'],
};
