import {
  safeScreenParams,
  __SAFE_SCREEN_PARAM_KEYS_FOR_TEST,
} from '@/lib/analytics/screenParams';

describe('safeScreenParams', () => {
  // The regression this exists for. Confirmed in production on 2026-09-10:
  // 6 `$screen` events carried `goalText` and 3 carried `title` — the goal
  // wording the user typed, shipped to PostHog by `screenTrack(pathname,
  // { ...params })` in app/_layout.tsx.
  it('drops user-authored free text', () => {
    const out = safeScreenParams({
      goalText: 'stop drinking so much',
      title: 'call mum every sunday',
      goalTitle: 'get out of debt',
      source: 'goal_create_fallback',
    });

    expect(out).toEqual({ source: 'goal_create_fallback' });
    expect(out.goalText).toBeUndefined();
    expect(out.title).toBeUndefined();
    expect(out.goalTitle).toBeUndefined();
  });

  // Never fired in production (verified: 0 events), because the screen reads
  // the session rather than the param — but the param is declared at
  // app/auth/reset-password-complete.tsx:42 and the spread would have shipped it.
  it('drops a password-reset token', () => {
    const out = safeScreenParams({ token: 'super-secret-recovery-token', type: 'recovery' });

    expect(out).toEqual({ type: 'recovery' });
    expect(out.token).toBeUndefined();
  });

  it('is fail-closed: an unknown key added later is dropped, not passed through', () => {
    const out = safeScreenParams({ somethingAddedNextYear: 'whatever the user typed' });

    expect(out).toEqual({});
  });

  it('keeps the safe keys the funnels actually rely on', () => {
    const out = safeScreenParams({
      source: 'notification',
      openReview: '1',
      milestoneKey: 'week_4',
      type: 'recovery',
      id: 'goal-uuid',
      goalId: 'goal-uuid',
      logMarkId: 'mark-uuid',
    });

    expect(out).toEqual({
      source: 'notification',
      openReview: '1',
      milestoneKey: 'week_4',
      type: 'recovery',
      id: 'goal-uuid',
      goalId: 'goal-uuid',
      logMarkId: 'mark-uuid',
    });
  });

  it('handles null/undefined/empty without throwing', () => {
    expect(safeScreenParams(null)).toEqual({});
    expect(safeScreenParams(undefined)).toEqual({});
    expect(safeScreenParams({})).toEqual({});
  });

  it('omits absent keys rather than emitting undefined values', () => {
    const out = safeScreenParams({ source: 'focus_card' });

    expect(Object.keys(out)).toEqual(['source']);
    expect('id' in out).toBe(false);
  });

  // Guard the guard: if someone adds a free-text key to the allowlist, this fails.
  it('allowlist contains no known free-text key', () => {
    for (const banned of ['goalText', 'title', 'goalTitle', 'token', 'note', 'query']) {
      expect(__SAFE_SCREEN_PARAM_KEYS_FOR_TEST).not.toContain(banned);
    }
  });
});
