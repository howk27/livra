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

const FOCUS = readFileSync(join(__dirname, '../../app/(tabs)/focus.tsx'), 'utf8');
const CARDS = readFileSync(join(__dirname, '../../components/focus/GoalCards.tsx'), 'utf8');

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** A named component's body, for asserting about one goal state at a time. */
function componentBody(name: string): string {
  const start = CARDS.indexOf(`export function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = CARDS.indexOf('\nexport function ', start + 1);
  const end = next === -1 ? CARDS.indexOf('\nfunction FoldRow', start) : next;
  return CARDS.slice(start, end === -1 ? undefined : end);
}

describe('focus — a done goal can always be folded back up', () => {
  it('no longer imports CaretRight at all', () => {
    // Every goal row either expands in place (down) or collapses (up). None of
    // them navigates, so the forward caret has no business on this screen.
    for (const src of [FOCUS, CARDS]) {
      expect(src).not.toMatch(/^import .*\bCaretRight\b.*from 'phosphor-react-native';$/m);
    }
  });

  it('renders no CaretRight element', () => {
    expect(FOCUS + CARDS).not.toContain('<CaretRight');
  });

  it('uses CaretUp on the expanded done-goal header', () => {
    expect(componentBody('ExpandedGoalCard')).toContain('<CaretUp');
  });

  it('invites expansion with CaretDown on both collapsed row kinds', () => {
    // The queued row and the done row: tapping either opens it in place.
    expect(componentBody('DoneGoalRow')).toContain('<CaretDown');
    expect(componentBody('QueuedGoalRow')).toContain('<CaretDown');
    expect(occurrences(CARDS, '<CaretDown')).toBe(2);
  });

  it('offers a fold row on the expanded done goal as well as the spotlight', () => {
    // Both routes out are now the one shared FoldRow, so this counts mounts
    // rather than the copy. If ExpandedGoalCard loses its <FoldRow, the done
    // goal is back to having no way out — the founder's original report.
    expect(componentBody('ExpandedGoalCard')).toContain('<FoldRow');
    expect(componentBody('SpotlightGoalCard')).toContain('<FoldRow');
    expect(occurrences(CARDS, '>Show less</Text>')).toBe(1);
  });

  it('labels every collapse control for screen readers', () => {
    // Header + the two fold rows.
    expect(occurrences(CARDS, 'Collapse ${goal.title}')).toBe(3);
    expect(CARDS).toContain('accessibilityLabel={label}');
  });

  it('declares the expanded state on the rows that toggle', () => {
    expect(componentBody('DoneGoalRow')).toContain('accessibilityState={{ expanded: false }}');
    expect(componentBody('ExpandedGoalCard')).toContain('accessibilityState={{ expanded: true }}');
  });

  it('keeps toggleGoalExpand as the single collapse mechanism', () => {
    // Guards against a second, divergent expansion state creeping in.
    expect(FOCUS).toContain('const toggleGoalExpand = useCallback');
    expect(occurrences(FOCUS, 'setExpandedGoalIds')).toBe(2);
  });
});
