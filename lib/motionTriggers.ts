// Pure predicates for when hero-moment animations fire. No React, no I/O.

/** True only on the transition into "everything loggable today is done". */
export function dayJustCompleted(prevAllDone: boolean, nextAllDone: boolean): boolean {
  return !prevAllDone && nextAllDone;
}

/** True when the momentum day-count visibly grew. Null on either side = no pulse
 *  (first render or missing snapshot must not celebrate). */
export function momentumDayIncreased(prevDays: number | null, nextDays: number | null): boolean {
  return prevDays != null && nextDays != null && nextDays > prevDays;
}
