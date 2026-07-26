import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Next Move milestone (spec §1, Task 7): focus.tsx's Spotlight card is now the
 * NextMoveCard hero + chip strip — the old "rest line" affordance (dimmed
 * done-for-week row + "Log one more" bonus button) is retired entirely, and
 * comeback state routes through the pure lib/comeback.ts + lib/focusQueue.ts
 * selectors rather than being reinvented inline.
 *
 * Source-string guard (cormorantScope pattern): locks the removal/adoption so
 * neither can silently regress.
 *
 * 2026-07-25 (k): the four goal states moved out of focus.tsx's map closure
 * into components/focus/GoalCards.tsx (cyclo 17 -> per-state renderers), so
 * the retirement checks scan BOTH files — a retired affordance coming back in
 * the extracted component would otherwise pass unnoticed.
 */

const FOCUS = readFileSync(join(__dirname, '../../app/(tabs)/focus.tsx'), 'utf8');
const CARDS = readFileSync(join(__dirname, '../../components/focus/GoalCards.tsx'), 'utf8');
const SRC = FOCUS + CARDS;

describe('focus.tsx — Next Move integration guard', () => {
  it('does not contain the retired "Log one more" bonus affordance', () => {
    expect(SRC).not.toContain('Log one more');
  });

  it('does not contain the retired restLineTextFor callback', () => {
    expect(SRC).not.toContain('restLineTextFor');
  });

  it('does not import the retired previousDayRestLineId helper', () => {
    expect(SRC).not.toContain('previousDayRestLineId');
  });

  it('does not contain the retired bonusButton style', () => {
    expect(SRC).not.toContain('bonusButton');
  });

  it('mounts NextMoveCard, via the spotlight renderer', () => {
    expect(FOCUS).toContain('<SpotlightGoalCard');
    expect(CARDS).toContain('<NextMoveCard');
  });

  it('wires the pure pickNextMove selector', () => {
    expect(SRC).toContain('pickNextMove');
  });

  it('wires the pure isComebackState selector', () => {
    expect(SRC).toContain('isComebackState');
  });

  it('the spotlight card renders NO mark rows (spec §1 Decision #1: "No extra rows" — done-for-week marks ask nothing today and appear nowhere on the spotlight card)', () => {
    // Stronger than the string scan this replaced: SpotlightGoalCard cannot
    // render a mark row because it is never handed one. The done-for-week rows
    // still exist elsewhere (the re-expanded done-today card, Daily Habits) —
    // those go to ExpandedGoalCard, which does take both.
    const spotlight = CARDS.slice(
      CARDS.indexOf('export function SpotlightGoalCard'),
      CARDS.indexOf('/** The "Show less" row'),
    );
    expect(spotlight.length).toBeGreaterThan(0);
    expect(spotlight).not.toContain('doneMarks');
    expect(spotlight).not.toContain('renderMarkRow');

    const expanded = CARDS.slice(
      CARDS.indexOf('export function ExpandedGoalCard'),
      CARDS.indexOf('export function SpotlightGoalCard'),
    );
    expect(expanded).toContain('doneMarks');
    expect(expanded).toContain('renderMarkRow');
  });
});
