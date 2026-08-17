// lib/health/healthDefaults.ts
//
// The two numbers that decide whether a health day QUALIFIES, in one place.
//
// They lived in three copies before 2026-08-17 — autoBind.ts (bind-time
// config), autoSync.ts (the qualification read) and healthReader.ts's inline
// `?? 8000`. That was survivable while nothing rendered them. It stops being
// survivable the moment mark detail SHOWS the user their threshold and lets
// them change it: a screen reading one copy while the sync reads another would
// print a number that is not the number being enforced, which is the exact
// class of lie the 7-hour sleep bar already cost us.
//
// Anything that displays, defaults, or enforces these reads from here.

/** Steps in a day for the day to count, when the binding carries no stepGoal. */
export const STEP_GOAL_FALLBACK = 8000;

/** Merged ASLEEP hours in the 20:00 -> 10:00 window for the night to count. */
export const SLEEP_HOURS_DEFAULT = 7;
