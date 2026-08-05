// lib/health/autoBind.ts
//
// QC64 side-note 3: after the Settings-level Apple Health connect, marks still
// each demanded their own "Connect to Apple Health" tap. The user has already
// granted every read type (integrations.tsx requests HEALTH_CONNECT_TYPES in
// one sheet), so a name-matched mark can be bound without asking again.
//
// Deliberate limits, matching the manual flow's semantics minus its prompts:
// - an EXISTING binding is never touched (manual config wins);
// - config stays null — steps' stepGoal and sleep's wake-time notification are
//   the mark-detail flow's business, still available there;
// - never throws: binding is a convenience layered over the connect toast.
import { detectHealthKitType } from './autoSuggest';
import { allHealthKitBindings, setHealthKitBinding } from './healthKitBinding';

export async function autoBindHealthMarks(
  marks: { id: string; name: string }[]
): Promise<string[]> {
  const bound: string[] = [];
  try {
    const existing = await allHealthKitBindings();
    for (const m of marks) {
      if (existing[m.id]) continue;
      const type = detectHealthKitType(m.name);
      if (!type) continue;
      await setHealthKitBinding(m.id, { type, config: null });
      bound.push(m.id);
    }
  } catch {
    // A failed pass costs nothing: the next connect or mount retries it.
  }
  return bound;
}
