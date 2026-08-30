// WR-4 — the Sunday-evening Weekly Review notification (spec 2026-08-29 §5).
import {
  WEEKLY_REVIEW_BODY,
  WEEKLY_REVIEW_HOUR,
  WEEKLY_REVIEW_MINUTE,
  WEEKLY_REVIEW_NOTIF_ID,
  WEEKLY_REVIEW_TITLE,
  WEEKLY_REVIEW_WEEKDAY,
  shouldScheduleWeeklyReview,
} from '../../lib/notifications/weeklyReview';

const allOn = {
  masterEnabled: true,
  prefEnabled: true,
  permissionGranted: true,
  hasActiveGoals: true,
};

describe('shouldScheduleWeeklyReview', () => {
  it('schedules only when every gate is open', () => {
    expect(shouldScheduleWeeklyReview(allOn)).toBe(true);
  });

  it.each([
    ['masterEnabled'],
    ['prefEnabled'],
    ['permissionGranted'], // denied → Focus card is the only arrival, no re-prompt
    ['hasActiveGoals'], // nothing to review, no notification
  ] as const)('any closed gate cancels: %s', (gate) => {
    expect(shouldScheduleWeeklyReview({ ...allOn, [gate]: false })).toBe(false);
  });
});

describe('schedule shape and copy', () => {
  it('fires Sunday 19:00 local under a stable Livra-owned identifier', () => {
    expect(WEEKLY_REVIEW_WEEKDAY).toBe(1); // expo WEEKLY: 1 = Sunday
    expect(WEEKLY_REVIEW_HOUR).toBe(19);
    expect(WEEKLY_REVIEW_MINUTE).toBe(0);
    // The livra- prefix keeps it inside cancelAllLivraScheduledNotifications'
    // ownership sweep when the master switch turns off.
    expect(WEEKLY_REVIEW_NOTIF_ID).toBe('livra-weekly-review');
  });

  it('copy carries no counts, no guilt vocabulary, no dashes', () => {
    for (const s of [WEEKLY_REVIEW_TITLE, WEEKLY_REVIEW_BODY]) {
      expect(s).not.toMatch(/\d/); // computed-at-render rule: no numbers in the notification
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/ - /);
      expect(s).not.toMatch(/\b(lose|losing|lost|streak|miss|missed|hurry|last chance|now or never)\b/i);
    }
    expect(WEEKLY_REVIEW_TITLE).toBe('Your week is ready.');
  });
});
