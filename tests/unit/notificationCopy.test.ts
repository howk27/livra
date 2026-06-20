import { MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE } from '../../lib/notifications/notificationCopy';

describe('notification master copy guardrails', () => {
  it('has a non-empty label and subtitle', () => {
    expect(MASTER_NOTIF_LABEL.length).toBeGreaterThan(0);
    expect(MASTER_NOTIF_SUBTITLE.length).toBeGreaterThan(0);
  });

  it('uses no em-dash, en-dash, or hyphen-as-a-dash', () => {
    for (const s of [MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE]) {
      expect(s).not.toMatch(/[—–]/); // em / en dash
      expect(s).not.toMatch(/ - /); // spaced hyphen used as a dash
    }
  });

  it('uses no streak-loss / fake-urgency language', () => {
    const banned = /\b(lose|losing|lost|streak|don't break|hurry|now or never)\b/i;
    expect(MASTER_NOTIF_SUBTITLE).not.toMatch(banned);
  });
});
