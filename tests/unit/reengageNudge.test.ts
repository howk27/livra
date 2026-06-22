import { planReengageNudge, REENGAGE_TITLE, REENGAGE_BODY } from '../../lib/notifications/reengageNudge';

const base = { activeGoalCount: 1, daysIdle: 7, lastNudgeDate: null, atRiskPlanned: false, today: '2026-06-22' };

describe('planReengageNudge', () => {
  it('returns the nudge at exactly 7 idle days', () => {
    expect(planReengageNudge(base)).toEqual({ title: REENGAGE_TITLE, body: REENGAGE_BODY });
  });
  it('returns null below the 7-day threshold', () => {
    expect(planReengageNudge({ ...base, daysIdle: 6 })).toBeNull();
  });
  it('returns null with no active goal', () => {
    expect(planReengageNudge({ ...base, activeGoalCount: 0 })).toBeNull();
  });
  it('suppresses when a momentum at-risk warning is planned', () => {
    expect(planReengageNudge({ ...base, atRiskPlanned: true })).toBeNull();
  });
  it('honors the weekly repeat cap', () => {
    expect(planReengageNudge({ ...base, lastNudgeDate: '2026-06-17' })).toBeNull(); // 5 days ago
    expect(planReengageNudge({ ...base, lastNudgeDate: '2026-06-15' })).toEqual({ title: REENGAGE_TITLE, body: REENGAGE_BODY }); // 7 days ago
  });
  it('copy carries no banned tokens or dashes', () => {
    const banned = /\b(lose|losing|lost|streak|miss|hurry|tomorrow|now or never)\b/i;
    for (const s of [REENGAGE_TITLE, REENGAGE_BODY]) {
      expect(s).not.toMatch(banned);
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/ - /);
      expect(s).not.toMatch(/don't|can't lose/i);
    }
  });
});
