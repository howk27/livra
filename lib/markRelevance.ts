// lib/markRelevance.ts
// Restricted marks are real, but only for goals actually about their domain — so
// neither the AI nor the deterministic matcher sprinkles them onto unrelated goals.
export const RESTRICTED_MARKS: Record<string, string[]> = {
  'cold-shower': ['Discipline'],
  'screen-time': ['Deep Work', 'Discipline'],
  'gratitude': ['Mindset'],
};

/** True unless markId is restricted AND none of its unlocking domains are inferred. */
export function isMarkAllowedForGoal(markId: string, goalDomains: Set<string>): boolean {
  const allowed = RESTRICTED_MARKS[markId];
  if (!allowed) return true;
  return allowed.some((d) => goalDomains.has(d));
}
