// Gap 2 of the 7-hour sleep bar (polish.md): the shortfall explanation shown
// under the Sleep target row on mark detail. The control shipped 2026-08-17;
// this is the voice — when a night had asleep time but missed the target, say
// the number and why the day was not logged.
import {
  formatAsleepDuration,
  sleepShortfallLine,
} from '../../../lib/health/sleepExplanation';

const H = 3_600_000;
const M = 60_000;

describe('formatAsleepDuration', () => {
  it('reads hours and minutes', () => {
    expect(formatAsleepDuration(6.5 * H)).toBe('6h 30m');
  });

  it('reads minutes alone under an hour', () => {
    expect(formatAsleepDuration(45 * M)).toBe('45m');
  });

  it('drops a zero minute component', () => {
    expect(formatAsleepDuration(7 * H)).toBe('7h');
  });

  it('floors to the minute so a near-miss can never display AT the target', () => {
    // 6h 59m 30s must not round up to 7h while failing a 7h bar.
    expect(formatAsleepDuration(7 * H - 30_000)).toBe('6h 59m');
  });
});

describe('sleepShortfallLine', () => {
  it('phrases the shortfall with the measured duration and the target', () => {
    const line = sleepShortfallLine(6.5 * H, 7);
    expect(line).toContain('6h 30m');
    expect(line).toContain('7h target');
    expect(line).toMatch(/didn't count/);
  });

  it('carries the asleep-vs-in-bed nuance (the most likely confusion)', () => {
    expect(sleepShortfallLine(6 * H, 7)).toMatch(/time in bed/);
  });

  it('phrases a decimal target the way the editor accepts it', () => {
    expect(sleepShortfallLine(6 * H, 7.5)).toContain('7.5h target');
  });

  it('is silent when the read failed (cannot-read is not a shortfall)', () => {
    expect(sleepShortfallLine(null, 7)).toBeNull();
  });

  it('is silent when Health holds no asleep time (absence is not a shortfall)', () => {
    expect(sleepShortfallLine(0, 7)).toBeNull();
  });

  it('is silent at or past the target (the check-in itself speaks then)', () => {
    expect(sleepShortfallLine(7 * H, 7)).toBeNull();
    expect(sleepShortfallLine(8 * H, 7)).toBeNull();
  });

  it('speaks one millisecond under the target', () => {
    expect(sleepShortfallLine(7 * H - 1, 7)).toContain('6h 59m');
  });

  it('uses the middle dot, never a dash, as separator (design rule)', () => {
    const line = sleepShortfallLine(6.5 * H, 7)!;
    expect(line).toContain('·');
    expect(line).not.toMatch(/[—–]/);
    expect(line).not.toMatch(/\s-\s/);
  });
});
