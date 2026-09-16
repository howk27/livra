// The review screen's share path after the story card (spec 2026-09-15 §7).
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
  it('mounts StoryShareSheet and no longer parks a card offscreen', () => {
    expect(src).toMatch(/<StoryShareSheet\b/);
    expect(src).not.toMatch(/WeeklyReviewShareCard/);
    expect(src).not.toMatch(/-9999/);
    expect(src).not.toMatch(/generateShareCard/); // capture lives in the sheet now
  });

  it('opens the sheet from Export and reports both events with ids only', () => {
    expect(src).toMatch(/WEEKLY_STORY_SHEET_OPENED/);
    expect(src).toMatch(/WEEKLY_REVIEW_SHARED/);
    expect(src).toMatch(/archetype_id/);
    expect(src).toMatch(/palette/);
    // Never the goal title or the archetype's words.
    expect(src).not.toMatch(/archetype\.name/);
    expect(src).not.toMatch(/archetype_name/);
  });

  it('the event exists in the taxonomy', () => {
    expect(ANALYTICS_EVENTS.WEEKLY_STORY_SHEET_OPENED).toBe('weekly_story_sheet_opened');
  });
});
