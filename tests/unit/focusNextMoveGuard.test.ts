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
 */

const SRC = readFileSync(join(__dirname, '../../app/(tabs)/focus.tsx'), 'utf8');

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

  it('mounts NextMoveCard', () => {
    expect(SRC).toContain('NextMoveCard');
  });

  it('wires the pure pickNextMove selector', () => {
    expect(SRC).toContain('pickNextMove');
  });

  it('wires the pure isComebackState selector', () => {
    expect(SRC).toContain('isComebackState');
  });

  it('the spotlight card renders NO mark rows below NextMoveCard (spec §1 Decision #1: "No extra rows" — done-for-week marks ask nothing today and appear nowhere on the spotlight card)', () => {
    // Strip comments first — the explanatory comment above the removed block
    // legitimately mentions the retired pattern by name; only CODE matters.
    const codeOnly = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const heroStart = codeOnly.indexOf('<NextMoveCard');
    expect(heroStart).toBeGreaterThan(-1);
    const cardEnd = codeOnly.indexOf('</View>', heroStart);
    expect(cardEnd).toBeGreaterThan(-1);
    const spotlightCardBody = codeOnly.slice(heroStart, cardEnd);
    // The done-for-week dimmed rows still exist elsewhere (the manually
    // re-expanded done-today goal card, and Daily Habits) — this only pins
    // that the spotlight card's own JSX block never reaches for them.
    expect(spotlightCardBody).not.toContain('doneMarks');
    expect(spotlightCardBody).not.toContain('renderMarkRow(');
  });
});
