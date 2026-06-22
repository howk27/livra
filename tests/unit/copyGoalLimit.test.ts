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

  it('is not re-typed as an inline literal in the call sites', () => {
    const sites = ['app/goal/new.tsx', 'components/sheets/AddGoalSheet.tsx'];
    for (const rel of sites) {
      const src = readFileSync(join(__dirname, '../../', rel), 'utf8');
      expect(src).not.toContain(
        "'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.'",
      );
      expect(src).toContain('GOAL_LIMIT_MESSAGE');
    }
  });
});
