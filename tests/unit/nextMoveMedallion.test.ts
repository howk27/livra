import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Next Move hero medallion wears the MARK'S OWN accent, never chrome.
 *
 * History: M8 shipped it as a solid `c.forest` circle with the accent glyph
 * inside. On device every hero icon read as "a green circle" and the mark's
 * identity disappeared (founder report 2026-07-26) — while every other
 * medallion surface (GoalCardMedallion, MarkRow's tile, the goal-detail hero)
 * already used the applyOpacity(accent, 0.12) wash the iconAccents band is
 * contrast-tuned for. This pins the wash so the hero can't drift back to chrome.
 */

const src = readFileSync(join(__dirname, '../../', 'components/NextMoveCard.tsx'), 'utf8');

describe('NextMoveCard hero medallion', () => {
  it('is washed with the hero mark\'s own accent, not painted chrome', () => {
    expect(src).toContain(
      'styles.medallion, { backgroundColor: applyOpacity(heroAccent, 0.12) }',
    );
  });

  it('never reaches for a solid forest/accent fill', () => {
    expect(src).not.toMatch(/styles\.medallion,\s*\{\s*backgroundColor:\s*c\.(forest|accent)/);
  });

  it('the glyph itself carries the same accent', () => {
    expect(src).toContain("createElement(heroIcon, { size: 20, color: heroAccent, weight: 'duotone' })");
  });
});
