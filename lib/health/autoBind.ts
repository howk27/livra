// lib/health/autoBind.ts
//
// QC64 side-note 3: after the Settings-level Apple Health connect, marks still
// each demanded their own "Connect to Apple Health" tap. The user has already
// granted every read type (integrations.tsx requests HEALTH_CONNECT_TYPES in
// one sheet), so a name-matched mark can be bound without asking again.
//
// Deliberate limits, matching the manual flow's semantics minus its prompts:
// - an EXISTING binding is never touched (manual config wins);
// - steps and sleep bind WITH defaults (health-auto-sync spec §2.9): stepGoal =
//   the user's 30-day average daily steps rounded to the nearest 500 (8000 when
//   Health has no history), sleepHours = 7 — both editable on mark detail,
//   where the sleep wake-time notification also still lives;
// - never throws: binding is a convenience layered over the connect toast.
import { detectHealthKitType } from './autoSuggest';
import { allHealthKitBindings, setHealthKitBinding } from './healthKitBinding';
import type { HealthKitBinding } from './healthKitBinding';
import { readAverageDailySteps } from './healthReader';
import type { HealthKitType } from './healthTypes';

const AUTO_BINDABLE: readonly HealthKitType[] = [
  'running',
  'workout',
  'hydration',
  'mindful',
  'steps',
  'sleep',
];

const STEP_GOAL_FALLBACK = 8000;
const SLEEP_HOURS_DEFAULT = 7;

/** 30-day average rounded to the NEAREST 500; 8000 when Health has no step
 * history (null) or the average is so low it would round to a degenerate 0. */
async function computeStepGoalDefault(): Promise<number> {
  const average = await readAverageDailySteps();
  if (average === null) return STEP_GOAL_FALLBACK;
  const rounded = Math.round(average / 500) * 500;
  return rounded > 0 ? rounded : STEP_GOAL_FALLBACK;
}

export async function autoBindHealthMarks(
  marks: { id: string; name: string }[]
): Promise<string[]> {
  const bound: string[] = [];
  try {
    const existing = await allHealthKitBindings();
    // Computed lazily, once per pass — a historical read is only worth making
    // when a steps mark is actually being bound.
    let stepGoal: number | undefined;
    for (const m of marks) {
      if (existing[m.id]) continue;
      const type = detectHealthKitType(m.name);
      if (!type) continue;
      if (!AUTO_BINDABLE.includes(type)) continue;
      let config: HealthKitBinding['config'] = null;
      if (type === 'steps') {
        if (stepGoal === undefined) stepGoal = await computeStepGoalDefault();
        config = { stepGoal };
      } else if (type === 'sleep') {
        config = { sleepHours: SLEEP_HOURS_DEFAULT };
      }
      await setHealthKitBinding(m.id, { type, config });
      bound.push(m.id);
    }
  } catch {
    // A failed pass costs nothing: the next connect or mount retries it.
  }
  return bound;
}
