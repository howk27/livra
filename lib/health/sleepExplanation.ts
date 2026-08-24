// lib/health/sleepExplanation.ts
//
// Gap 2 of the 7-hour sleep bar (polish.md): the qualification used to be
// SILENT. A 6h30 night produced no log and no explanation, so the user could
// not tell Health-is-broken from disconnected from working-as-designed. The
// control (visible, editable threshold) shipped 2026-08-17; this is the voice.
//
// Pure on purpose, same contract as healthConfigValue: mark detail owns the
// rendering; this owns what is said and when saying it is honest. The number
// it phrases comes from readAsleepMs, which shares mergedAsleepMsByDay with
// the auto-sync qualification — the screen can never print a duration the
// engine did not measure.

/**
 * "6h 30m" · "45m" · "7h". FLOORS to the minute so a 6h59m30s night can never
 * display as "7h" while failing a 7h target — whenever the measurement is
 * under the threshold, the displayed number is too.
 */
export function formatAsleepDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Drop a trailing .0 so 7 reads "7" and 6.5 reads "6.5" (matches the sheet). */
function trimHours(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

/**
 * The line under the Sleep target row, or null when there is nothing honest
 * to say: null when the read failed (cannot-know is not slept-nothing), null
 * when Health holds no asleep time (absence is not a shortfall — that is the
 * disconnected/no-data story, out of this line's scope), and null at or past
 * the target (the check-in itself speaks then).
 */
export function sleepShortfallLine(
  asleepMs: number | null,
  sleepHours: number,
): string | null {
  if (asleepMs === null || asleepMs <= 0) return null;
  if (asleepMs >= sleepHours * 3_600_000) return null;
  return (
    `Apple Health shows ${formatAsleepDuration(asleepMs)} asleep last night · ` +
    `under your ${trimHours(sleepHours)}h target, so it didn't count. ` +
    'Only time asleep counts, not time in bed.'
  );
}
