// The review screen's share path (spec 2026-09-15 §7, reworked 2026-09-18).
// Source guard, comments stripped first (repo rule: a scanner that matches a
// comment measures nothing).
import { readFileSync } from 'fs';
import { join } from 'path';
import { ANALYTICS_EVENTS } from '../../../lib/analytics/events';

const src = readFileSync(join(__dirname, '../../../app/review/index.tsx'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

describe('review screen share wiring', () => {
  it('opens on the animated story card with the share controls under it', () => {
    expect(src).toMatch(/<WeeklyStoryCard\b[\s\S]*?\banimate\b/);
    expect(src).toMatch(/<StoryShareControls\b/);
    expect(src).toMatch(/ready=\{storySettled\}/);
    expect(src).not.toMatch(/WeeklyReviewShareCard/);
    expect(src).not.toMatch(/-9999/);
  });

  // 2026-09-18 device freeze: the sheet rendered through OverlayPortal
  // (FullWindowOverlay), so the OS share sheet opened UNDER it. The share
  // path must never go back into an overlay.
  it('never shares from an overlay', () => {
    expect(src).not.toMatch(/StoryShareSheet/);
    expect(src).not.toMatch(/OverlayPortal/);
    expect(src).not.toMatch(/FullWindowOverlay/);
  });

  // PRIVACY PIN (spec 2026-09-20). resolveFirstName falls back to the EMAIL
  // PREFIX when no name is saved — acceptable in a greeting on the person's
  // own screen, a published handle on an image posted to strangers. The
  // signature takes a genuinely saved display name or nothing.
  it('signs with a saved display name only, never the email-prefix resolver', () => {
    expect(src).toMatch(/resolveInitialDisplayName\(/);
    expect(src).not.toMatch(/resolveFirstName/);
    expect(src).toMatch(/signatureName=\{storyPrefs\.showName \? signatureName : null\}/);
  });

  it('passes the personalization switches to card and controls', () => {
    expect(src).toMatch(/showWeeksIn=\{storyPrefs\.showWeeksIn\}/);
    expect(src).toMatch(/showGoalTitle=\{storyPrefs\.showGoalTitle\}/);
    expect(src).toMatch(/prefs=\{storyPrefs\}/);
    expect(src).toMatch(/canSign=\{signatureName !== null\}/);
  });

  it('reports the share with ids only', () => {
    expect(src).toMatch(/WEEKLY_REVIEW_SHARED/);
    expect(src).toMatch(/archetype_id/);
    expect(src).toMatch(/palette/);
    expect(src).not.toMatch(/archetype\.name/);
    expect(src).not.toMatch(/archetype_name/);
    // The switches are reported as booleans; their CONTENT never is.
    expect(src).toMatch(/show_name:/);
    expect(src).toMatch(/show_weeks_in:/);
    expect(src).toMatch(/show_goal_title:/);
    expect(src).not.toMatch(/signature_name|(?<!show_)goal_title:/);
    expect(ANALYTICS_EVENTS.WEEKLY_REVIEW_SHARED).toBe('weekly_review_shared');
  });
});
