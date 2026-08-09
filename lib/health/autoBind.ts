// lib/health/autoBind.ts
//
// QC64 side-note 3: after the Settings-level Apple Health connect, marks still
// each demanded their own "Connect to Apple Health" tap. The user has already
// granted every read type (integrations.tsx requests HEALTH_CONNECT_TYPES in
// one sheet), so a name-matched mark can be bound without asking again.
//
// Deliberate limits, matching the manual flow's semantics minus its prompts:
// - an EXISTING binding is never touched (manual config wins);
// - only marks the LIBRARY declares health-able bind (resolveHealthKitType —
//   founder 2026-08-06, the curated 3, not the old name regex);
// - steps and sleep bind WITH defaults (health-auto-sync spec §2.9): stepGoal =
//   the user's 30-day average daily steps rounded to the nearest 500 (8000 when
//   Health has no history), sleepHours = 7.
//   CORRECTED 2026-08-09: this comment used to say BOTH were "editable on mark
//   detail". Only stepGoal is — app/mark/[id]/index.tsx:554-559 passes a
//   stepGoal and nothing anywhere writes sleepHours, so the 7-hour bar cannot
//   be changed by a user. A 6h30 night therefore never qualifies and the app
//   says nothing about why. Making it editable is PINNED until after 2.0 ships
//   (founder 2026-08-09) — see .reports/polish.md. Do not "fix" the threshold
//   logic; it is correct. The missing thing is the control;
// - never throws: binding is a convenience layered over the connect toast.
import { resolveHealthKitType } from './autoSuggest';
import { allHealthKitBindings, setHealthKitBinding } from './healthKitBinding';
import type { HealthKitBinding } from './healthKitBinding';
import { readAverageDailySteps } from './healthReader';

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
  marks: { id: string; name: string; emoji?: string | null }[]
): Promise<string[]> {
  const bound: string[] = [];
  try {
    const existing = await allHealthKitBindings();
    // Computed lazily, once per pass — a historical read is only worth making
    // when a steps mark is actually being bound.
    let stepGoal: number | undefined;
    for (const m of marks) {
      if (existing[m.id]) continue;
      const type = resolveHealthKitType(m);
      if (!type) continue;
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
