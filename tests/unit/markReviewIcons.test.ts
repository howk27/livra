import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard (2026-07-19): the two goal-creation "review your plan" surfaces render
 * the mark's app icon (phosphor duotone tile), never the raw emoji — matching
 * MarkRow and the QC 2026-07-12 rule ("app icons, never raw emoji in chrome").
 * These were the last two surfaces still showing emoji; this pins the fix.
 */
const read = (rel: string): string => readFileSync(join(__dirname, '../../', rel), 'utf8');

describe('goal-review surfaces render the mark icon, not raw emoji', () => {
  it('onboarding step 3 marks use an icon tile, not {mark.emoji}', () => {
    const src = read('app/onboarding.tsx');
    expect(src).not.toMatch(/\{mark\.emoji\}/);
    expect(src).toContain('markIconTile');
    expect(src).toContain('weight="duotone"');
  });

  it('AI package review uses an icon tile, not {resolved.emoji}', () => {
    const src = read('components/ai/GoalPackageReview.tsx');
    expect(src).not.toMatch(/\{resolved\.emoji\}/);
    expect(src).toContain('markIconTile');
    expect(src).toContain('weight="duotone"');
  });
});
