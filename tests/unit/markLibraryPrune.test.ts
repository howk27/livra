import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import { VALID_ICONS, AI_ICON_TO_MARK_ID } from '../../lib/ai/goalGeneration';
import { GOAL_TEMPLATES } from '../../lib/onboarding/markRecommendations';

const PRUNED = ['wake-early', 'posture', 'affirmations', 'no-phone', 'vitamins', 'rest'];

describe('mark legitimacy prune', () => {
  it('pruned ids are gone from the library', () => {
    const ids = MARK_LIBRARY.map((m) => m.id);
    for (const p of PRUNED) expect(ids).not.toContain(p);
  });
  it('library is exactly the 38 survivors', () => {
    expect(MARK_LIBRARY).toHaveLength(38);
  });
  it('VALID_ICONS reaches every surviving library mark (no coverage gap)', () => {
    const reachable = new Set((VALID_ICONS as readonly string[]).map((i) => AI_ICON_TO_MARK_ID[i as keyof typeof AI_ICON_TO_MARK_ID]));
    for (const m of MARK_LIBRARY) expect(reachable.has(m.id)).toBe(true);
  });
  it('no VALID_ICON resolves to a pruned mark', () => {
    for (const i of VALID_ICONS as readonly string[]) {
      expect(PRUNED).not.toContain(AI_ICON_TO_MARK_ID[i as keyof typeof AI_ICON_TO_MARK_ID]);
    }
  });
  it('onboarding templates reference no pruned ids and still meet minMarks', () => {
    for (const t of GOAL_TEMPLATES) {
      for (const p of PRUNED) expect(t.recommendedMarkIds).not.toContain(p);
      expect(t.recommendedMarkIds.length).toBeGreaterThanOrEqual(t.minMarks);
    }
  });
});
