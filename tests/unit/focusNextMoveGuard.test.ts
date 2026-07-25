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
});
