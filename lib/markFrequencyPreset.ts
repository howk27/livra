import type { DayOfWeek, FrequencyKind } from '../types';

/**
 * Cadence presets that replace the raw weekday grid as the primary frequency
 * chooser on the custom mark-creation flow (PRD Final-Update §8).
 *
 * Deliberately three, not four: "1/day" and "daily" describe the same cadence
 * (7 completions a week), so they are collapsed into a single `everyDay` preset.
 * The third path, `custom`, discloses the weekday grid for people who want
 * specific days.
 */
export type FrequencyPreset = 'everyDay' | 'threePerWeek' | 'custom';

export const DEFAULT_FREQUENCY_PRESET: FrequencyPreset = 'everyDay';

export const FREQUENCY_PRESET_LABELS: Record<FrequencyPreset, string> = {
  everyDay: 'Every day',
  threePerWeek: '3x a week',
  custom: 'Custom days',
};

const WEEKDAY_DEFAULT: DayOfWeek[] = [1, 2, 3, 4, 5];

function clampWeeklyTarget(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(7, Math.max(1, Math.round(n)));
}

/**
 * The stored `weekly_target` a preset maps to for a mark of the given kind.
 *
 * Fixed and abstinence marks are every-day by nature (sleep every night, a
 * no-alcohol streak counts all seven days), so they always resolve to 7
 * regardless of the chosen preset. Only variable marks vary by preset.
 *
 * `customDayCount` is the number of selected weekdays; it is only consulted for
 * the `custom` preset on variable marks.
 */
export function weeklyTargetForPreset(
  preset: FrequencyPreset,
  frequencyKind: FrequencyKind,
  customDayCount = 0,
): number {
  if (frequencyKind === 'fixed' || frequencyKind === 'abstinence') return 7;

  switch (preset) {
    case 'everyDay':
      return 7;
    case 'threePerWeek':
      return 3;
    case 'custom':
      return clampWeeklyTarget(customDayCount);
    default:
      return 3;
  }
}

/**
 * The `schedule_type` / `schedule_days` a preset persists. The per-mark
 * frequency data model is untouched (decision 2026-07-12) — this only decides
 * which of the existing fields the input control writes.
 *
 *   everyDay      → daily schedule (no fixed days)
 *   threePerWeek  → daily schedule, flexible (any 3 days count; weekly_target carries the "3")
 *   custom        → custom schedule with the selected weekday set
 */
export function scheduleForPreset(
  preset: FrequencyPreset,
  customDays: DayOfWeek[],
): { schedule_type: 'daily' | 'custom'; schedule_days?: string } {
  if (preset === 'custom') {
    const days = customDays.length > 0 ? customDays : WEEKDAY_DEFAULT;
    return { schedule_type: 'custom', schedule_days: JSON.stringify(days) };
  }
  return { schedule_type: 'daily' };
}
