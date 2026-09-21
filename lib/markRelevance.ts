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

// Equipment sports are opt-in BY NAME. Swim needs a pool and cycling needs a
// bike, so neither may pad a plan the goal never asked for (founder 2026-09-21:
// "Run a 5K" offered both). The 2026-08-04 fix was a prompt rule on the AI path
// only; the deterministic matcher was never covered, and a prompt is a request,
// not a guard. Both paths call this. Words are matched whole or as a stem
// prefix ("swimming" names swim; "spin" names cycling).
export const NAMED_ONLY_SPORTS: Record<string, string[]> = {
  swim: ['swim', 'pool', 'laps', 'triathlon', 'ironman'],
  cycling: ['cycl', 'bike', 'biking', 'bicycle', 'spin', 'ride', 'riding', 'triathlon', 'ironman'],
};

/** True unless markId is an equipment sport the goal's own words never name. */
export function isSportNamedByGoal(markId: string, goalTokens: string[]): boolean {
  const names = NAMED_ONLY_SPORTS[markId];
  if (!names) return true;
  return goalTokens.some((token) => names.some((name) => token.startsWith(name)));
}
