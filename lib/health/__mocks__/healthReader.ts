import type { HealthKitType } from '../healthTypes';

export const readWorkoutDays = jest.fn().mockResolvedValue(new Set<string>());
export const readSleepDays = jest.fn().mockResolvedValue(new Set<string>());
export const readHydrationDays = jest.fn().mockResolvedValue(new Set<string>());
export const readMindfulDays = jest.fn().mockResolvedValue(new Set<string>());
export const readStepDays = jest.fn().mockResolvedValue(new Set<string>());
export const readRunningDays = jest.fn().mockResolvedValue(new Set<string>());
export const readHealthDays = jest.fn(
  (_type: HealthKitType, _weekDates: string[], _config?: { stepGoal?: number }) =>
    Promise.resolve(new Set<string>()),
);
