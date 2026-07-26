import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every mark-creation path either honors an explicit intensity choice made
 * right there, or falls back to the app's stored Pace (Settings) — never a
 * flat "recommended" regardless of either.
 *
 * Founder device report 2026-07-26: "Grow my business" (Networking, Focus)
 * got the same cadence no matter what frequency was picked at creation, and
 * separately asked that cadence "take into consideration the Pace users are
 * going at." Investigation found THREE systems sharing the same three-step
 * vocabulary (easing/steady/push a.k.a. light/steady/pushing) that never
 * talked to each other: onboarding's commitment picker, CommitmentScreen's
 * frequency picker (app/goal/new.tsx), and the Settings Pace toggle. Only
 * the Settings toggle actually recalculated existing marks; the other two
 * threw their choice away per mark and never updated the app's stored Pace,
 * so a mark added anywhere else (mark/new.tsx's quick-add) had no way to
 * know what intensity the user was already at.
 *
 * These are source-string guards (the screens don't render in unit tests,
 * matching weeklyTargetIntegrity.test.ts's pattern) pinning the WIRING, not
 * the arithmetic — frequencyWeeklyTarget/paceWeeklyTarget/paceFromFrequency
 * each have their own behavioral tests in goalMarkSuggestions.test.ts /
 * paceSetting.test.ts.
 */

const ROOT = join(__dirname, '../../');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('app/goal/new.tsx — CommitmentScreen frequency drives per-mark cadence', () => {
  const src = read('app/goal/new.tsx');

  it('sets each mark\'s weekly_target from the chosen frequency, not a flat recommended', () => {
    expect(src).toContain('weekly_target: frequencyWeeklyTarget(sugg, selection.frequency)');
    expect(src).not.toContain('weekly_target: sugg.frequency_recommended');
  });

  it('the chosen frequency becomes the app-wide Pace for marks created elsewhere', () => {
    expect(src).toContain('setPace(paceFromFrequency(selection.frequency))');
  });
});

describe('app/mark/new.tsx — quick-add from the library reads the current Pace', () => {
  const src = read('app/mark/new.tsx');

  it('resolves weekly_target via the stored Pace before falling back to recommended', () => {
    const start = src.indexOf('const handleConfirmSuggestedCounter');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('const handleSave', start);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toContain('await getPace()');
    expect(body).toContain('paceWeeklyTarget(');
    expect(body).toContain('?? pendingSuggestedCounter.frequency_recommended');
    // The old unconditional line must be gone from THIS function specifically.
    expect(body).not.toContain('weekly_target: pendingSuggestedCounter.frequency_recommended ?? 3');
  });
});

describe('app/onboarding.tsx — the chosen commitment becomes the app-wide Pace', () => {
  const src = read('app/onboarding.tsx');

  it('calls setPace with the finalized commitment level', () => {
    expect(src).toContain('setPace(level)');
  });
});
