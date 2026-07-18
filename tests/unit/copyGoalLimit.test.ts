import { readFileSync } from 'fs';
import { join } from 'path';
import { GOAL_LIMIT_MESSAGE } from '../../lib/copy';

describe('GOAL_LIMIT_MESSAGE centralization', () => {
  it('matches the expected copy and is dash-free', () => {
    expect(GOAL_LIMIT_MESSAGE).toBe(
      'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.',
    );
    expect(GOAL_LIMIT_MESSAGE).not.toMatch(/[—–]/);
  });

  it('is never re-typed as an inline literal at any call site', () => {
    // M7-QC45: goal/new's cap path now delegates to GoalLimitDialog, so the copy
    // is rendered from the dialog rather than the screen — but the no-inline-
    // literal rule holds everywhere it could be re-typed.
    const noInlineSites = ['app/goal/new.tsx', 'hooks/useSuggestGoalFlow.ts', 'components/ui/GoalLimitDialog.tsx'];
    for (const rel of noInlineSites) {
      const src = readFileSync(join(__dirname, '../../', rel), 'utf8');
      expect(src).not.toContain(
        "'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.'",
      );
    }
  });

  it('is centralized through the GOAL_LIMIT_MESSAGE constant where the copy is shown', () => {
    // M7-QC45 fold-in: both cap paths (manual goal/new and the AI suggest flow)
    // now delegate to GoalLimitDialog, so the copy is rendered from the one
    // dialog. The suggest hook no longer references the message directly.
    const usageSites = ['components/ui/GoalLimitDialog.tsx'];
    for (const rel of usageSites) {
      const src = readFileSync(join(__dirname, '../../', rel), 'utf8');
      expect(src).toContain('GOAL_LIMIT_MESSAGE');
    }
  });
});
