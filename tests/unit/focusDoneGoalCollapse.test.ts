import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Founder device report 2026-07-24: "A goal is completed, then expanded and I'm
 * unable to close it back up."
 *
 * The header tap DID toggle, but nothing said so: the row carried a CaretRight
 * (the navigate-forward affordance used everywhere else to push a detail
 * screen), and the explicit "Show less" fold row is gated to
 * `spotlightOverride === goal.id`, which a done goal never holds. So the only
 * working control looked like a link to somewhere else.
 *
 * Source-string guard, following the focusNextMoveGuard/cormorantScope pattern
 * used for this screen: focus.tsx is not rendered in unit tests, so the caret
 * vocabulary and the fold row are locked here instead.
 */

const SRC = readFileSync(join(__dirname, '../../app/(tabs)/focus.tsx'), 'utf8');

const occurrences = (needle: string) => SRC.split(needle).length - 1;

describe('focus.tsx — a done goal can always be folded back up', () => {
  it('no longer imports CaretRight at all', () => {
    // Every goal row either expands in place (down) or collapses (up). None of
    // them navigates, so the forward caret has no business on this screen.
    expect(SRC).not.toMatch(/^import .*\bCaretRight\b.*from 'phosphor-react-native';$/m);
  });

  it('renders no CaretRight element', () => {
    expect(SRC).not.toContain('<CaretRight');
  });

  it('uses CaretUp on the expanded done-goal header', () => {
    expect(SRC).toContain('<CaretUp');
  });

  it('invites expansion with CaretDown on both collapsed row kinds', () => {
    // The queued row and the done row: tapping either opens it in place.
    expect(occurrences('<CaretDown')).toBe(2);
  });

  it('carries a "Show less" fold row for the expanded done goal as well as the spotlight', () => {
    // One in the `!isSpotlight` branch (this fix), one for a hoisted spotlight
    // override. If this drops back to 1, the done goal has lost its way out.
    // Matched on the rendered element so prose mentioning it does not count.
    expect(occurrences('>Show less</Text>')).toBe(2);
  });

  it('labels both collapse controls for screen readers', () => {
    expect(occurrences('accessibilityLabel={`Collapse ${goal.title}`}')).toBe(3);
  });

  it('declares the expanded state on the rows that toggle', () => {
    expect(SRC).toContain('accessibilityState={{ expanded: false }}');
    expect(SRC).toContain('accessibilityState={{ expanded: true }}');
  });

  it('keeps toggleGoalExpand as the single collapse mechanism', () => {
    // Guards against a second, divergent expansion state creeping in.
    expect(SRC).toContain('const toggleGoalExpand = useCallback');
    expect(occurrences('setExpandedGoalIds')).toBe(2);
  });
});
