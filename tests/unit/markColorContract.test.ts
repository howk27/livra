import { readFileSync } from 'fs';
import { join } from 'path';
import { categoryAccents, iconAccents } from '../../theme/tokens';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import {
  CATEGORY_LABELS,
  colorForSuggestedCounter,
  getCategoryColor,
  getCategoryForIcon,
  getCategoryForSuggestedCounter,
  getCategoryColorForMark,
  getIconAccent,
} from '../../lib/markCategory';
import { MARK_ICON_OPTIONS } from '../../lib/markIcons';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';

/**
 * QC4-M — "the thing you built is the thing you get."
 *
 * The bug: app/mark/new.tsx previewed a popular chip in the library mark's own
 * muted color and then SAVED a color derived from a keyword guess over a
 * fourth, invented taxonomy, resolving to one of five bright generic hexes.
 * Preview and save are now one function, over one taxonomy, from one palette.
 */

const ROOT = join(__dirname, '../../');
// Batch 2 (founder 2026-07-18): the sanctioned palette is now two tables —
// category accents for category-level chrome, per-icon accents for mark color.
const SANCTIONED = new Set<string>([
  ...Object.values(categoryAccents),
  ...Object.values(iconAccents),
]);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('mark color comes only from the sanctioned palette (QC4-M)', () => {
  it('every library mark saves a sanctioned color', () => {
    for (const mark of MARK_LIBRARY) {
      expect(SANCTIONED.has(colorForSuggestedCounter(mark))).toBe(true);
    }
  });

  it('every picker icon has its own sanctioned accent — the custom path never regresses', () => {
    for (const iconType of MARK_ICON_OPTIONS) {
      expect(SANCTIONED.has(getIconAccent(iconType))).toBe(true);
      // Category derivation stays sanctioned too (category-level chrome).
      expect(SANCTIONED.has(getCategoryColor(getCategoryForIcon(iconType)))).toBe(true);
    }
  });

  // Batch 2 (founder): "the goal has 4 greens and one red" — per-icon accents
  // exist so a goal's marks are tellable apart. Every icon accent is distinct.
  it('per-icon accents are pairwise unique', () => {
    const values = Object.values(iconAccents);
    expect(new Set(values).size).toBe(values.length);
  });

  it('the marks a typical goal suggests do not share a color', () => {
    for (const goal of ['Run a 5k', 'Fix my sleep', 'Get my stress under control']) {
      const suggested = getMarksForGoal(goal).slice(0, 5);
      const hues = suggested.map((m) => colorForSuggestedCounter(m));
      expect(new Set(hues).size).toBe(hues.length);
    }
  });

  it('drops the five bright generics entirely', () => {
    // Tailwind orange-500 / blue-500 / emerald-500 / purple-500 / gray-400 —
    // CATEGORY_DEFAULT_COLORS, the palette that was never sanctioned.
    for (const generic of ['#F97316', '#3B82F6', '#10B981', '#A855F7', '#9CA3AF']) {
      expect(SANCTIONED.has(generic)).toBe(false);
      for (const mark of MARK_LIBRARY) {
        expect(colorForSuggestedCounter(mark)).not.toBe(generic);
      }
    }
  });

  it('resolves a library mark off its own identity, deterministically', () => {
    // Batch 2: a library id that matches a picker icon carries that icon's
    // accent — the exact same hue the manual path would save.
    expect(colorForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'steps')!)).toBe(iconAccents.steps);
    expect(colorForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'water')!)).toBe(iconAccents.water);
    // Category resolution itself is unchanged (chrome still reads it).
    expect(getCategoryForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'sleep')!)).toBe('recovery');
    expect(getCategoryForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'reading')!)).toBe('deepWork');
    // Ids with no picker twin hash to a stable sanctioned hue.
    const saving = MARK_LIBRARY.find(m => m.id === 'saving')!;
    expect(colorForSuggestedCounter(saving)).toBe(colorForSuggestedCounter(saving));
    expect(SANCTIONED.has(colorForSuggestedCounter(saving))).toBe(true);
  });

  it('an unknown category still yields a sanctioned color, never invented hex', () => {
    const alien = { ...MARK_LIBRARY[0], category: 'Astrology' };
    expect(getCategoryForSuggestedCounter(alien)).toBe('custom');
    expect(SANCTIONED.has(colorForSuggestedCounter(alien))).toBe(true);
  });

  // SUPERSEDED (founder call, 2026-07-16, on device after the QC4 merge): this
  // asserted that a stored color always wins, pinning the deliberate decision to
  // leave pre-QC4-M marks alone. The founder saw the result — old bright marks
  // beside new muted ones in one list — and asked for the update to reach them.
  // The concern the test names, "no silent rewrite of user data", still holds and
  // is now asserted directly: healing is on READ, and nothing is written.
  it('a SANCTIONED stored color still wins for an existing mark', () => {
    expect(getCategoryColorForMark({ name: 'Run', color: categoryAccents.fitness }))
      .toBe(categoryAccents.fitness);
    // Only a mark with no color at all gets one derived.
    expect(SANCTIONED.has(getCategoryColorForMark({ name: 'Run', color: '' }))).toBe(true);
  });

  it('never rewrites stored data — healing is read-only', () => {
    const src = readFileSync(join(ROOT, 'lib/markCategory.ts'), 'utf8');
    // A resolver, not a migration: no writes, no UPDATE, no store mutation.
    expect(src).not.toMatch(/\bUPDATE\b|execAsync|runAsync|setState/);
  });

  it('labels every category key it can return', () => {
    for (const key of Object.keys(categoryAccents)) {
      expect(CATEGORY_LABELS[key as keyof typeof categoryAccents]).toBeTruthy();
    }
  });
});

describe('preview and save are the same call (QC4-M)', () => {
  const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');

  it('the popular chip paints with the resolver, not the library hex', () => {
    expect(src).toMatch(/const markColor = colorForSuggestedCounter\(mark\)/);
    // The old divergence: the chip read mark.color while save derived its own.
    expect(src).not.toMatch(/applyOpacity\(mark\.color/);
    expect(src).not.toMatch(/color=\{staged \? themeColors\.forest : mark\.color\}/);
  });

  it('the save writes that same resolver call', () => {
    expect(src).toMatch(/color: colorForSuggestedCounter\(pendingSuggestedCounter\)/);
  });
});

/**
 * QC4-L — users control which goal a mark joins.
 */
describe('mark/new lets the user choose the goal (QC4-L)', () => {
  const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');
  // The old shapes are quoted in the comments that explain why they went — scan
  // the code, not the prose.
  const code = stripComments(src);

  it('no longer grabs the first active goal', () => {
    expect(code).not.toMatch(/goals\.find\(g => g\.status === 'active'\)/);
  });

  it('reads the store through selectors, never getState() during render', () => {
    expect(code).not.toMatch(/useGoalsStore\.getState\(\)/);
    expect(code).toMatch(/const goals = useGoalsStore\(s => s\.goals\)/);
  });

  it('offers a chooser only when there is a real choice to make', () => {
    expect(src).toMatch(/activeGoals\.length === 1 \? activeGoals\[0\]\.id : null/);
    expect(src).toMatch(/linkToGoal && activeGoals\.length > 1/);
  });

  it('never links to a goal the user did not pick', () => {
    expect(src).toMatch(/const needsGoalChoice = linkToGoal && !targetGoalId/);
    expect(src).toMatch(/Pick which goal this mark belongs to\./);
  });

  it('leaves the per-goal cap to lib/gating via createCounter', () => {
    expect(src).toMatch(/\.\.\.\(linkTargetId \? \{ goal_id: linkTargetId \} : \{\}\)/);
    // The cap is never reimplemented on the screen.
    expect(src).not.toMatch(/FREE_MARKS_PER_GOAL/);
  });
});

describe('goal detail can link and unlink marks (QC4-L)', () => {
  const src = readFileSync(join(ROOT, 'app/goal/[id].tsx'), 'utf8');

  it('has a link affordance and a picker', () => {
    expect(src).toMatch(/function LinkMarkSheet/);
    expect(src).toMatch(/testID="goal-link-existing"/);
  });

  it('has an unlink affordance behind a manage toggle', () => {
    expect(src).toMatch(/testID="goal-marks-manage"/);
    expect(src).toMatch(/const handleUnlink/);
  });

  it('writes BOTH records a link is made of', () => {
    // mark.goal_id drives this screen's list + the free cap; linked_mark_ids
    // drives progress and momentum. Writing one and not the other is the bug.
    expect(src).toMatch(/await updateMark\(markId, \{ goal_id: id! \}\)/);
    expect(src).toMatch(/await linkMarkToGoal\(id!, markId\)/);
    expect(src).toMatch(/await unlinkMarkFromGoal\(id!, mark\.id\)/);
    expect(src).toMatch(/await updateMark\(mark\.id, \{ goal_id: null \}\)/);
  });

  it('uses the real gate rather than its own cap', () => {
    expect(src).toMatch(/canAddMarkToGoal\(isProUnlocked, countMarksInGoal\(marks, id \?\? ''\)\)/);
    expect(src).toMatch(/from '\.\.\/\.\.\/lib\/gating'/);
  });

  it('tells the user what unlinking costs before it happens', () => {
    expect(src).toMatch(/keeps all of its history/);
  });
});

/**
 * QC4-M follow-up — marks written BEFORE QC4-M must heal on read.
 *
 * Founder, on device after the QC4 merge: "QC4-M didn't change the colors for
 * the marks already written." True — QC4-M fixed the WRITE path, but
 * getCategoryColorForMark returned `mark.color || derived`, so any stored value
 * won and old marks stayed bright next to new muted ones in the same list.
 */
describe('QC4-M — legacy stored colors heal on read', () => {
  // The five invented generics QC4-M deleted, plus the old "Vibe" picker's
  // palette (VD-7 removed it) and widgetSync's private fallback. Four of the
  // Vibe swatches are byte-identical to the generics, so a hand-picked color is
  // indistinguishable from a machine-derived one — both must heal.
  const LEGACY_HEXES = [
    '#3B82F6', '#F97316', '#10B981', '#A855F7', '#9CA3AF', // CATEGORY_DEFAULT_COLORS
    '#EF4444', '#EC4899',                                   // Vibe-only swatches
    '#C47E8A',                                              // widgetSync fallback
  ];

  it.each(LEGACY_HEXES)('ignores the dead stored hex %s', (hex) => {
    const color = getCategoryColorForMark({ name: 'Run', color: hex });
    expect(color).not.toBe(hex);
    expect(SANCTIONED.has(color)).toBe(true);
  });

  it('heals to the SAME color the mark would be created with today', () => {
    for (const mark of MARK_LIBRARY.slice(0, 12)) {
      const fresh = colorForSuggestedCounter(mark);
      const legacy = getCategoryColorForMark({ name: mark.name, color: '#F97316' });
      // An old mark and a new mark of the same name must not disagree.
      expect(legacy).toBe(getCategoryColorForMark({ name: mark.name, color: null }));
      expect(SANCTIONED.has(fresh)).toBe(true);
    }
  });

  it('still honours a stored color that IS sanctioned', () => {
    const sanctioned = categoryAccents.fitness;
    expect(getCategoryColorForMark({ name: 'Anything', color: sanctioned })).toBe(sanctioned);
  });

  it('handles null/empty stored color without falling back to a raw hex', () => {
    for (const stored of [null, undefined, '']) {
      const color = getCategoryColorForMark({ name: 'Run', color: stored as any });
      expect(SANCTIONED.has(color)).toBe(true);
    }
  });

  it('the widget resolves color through the same healer, not mark.color raw', () => {
    const src = readFileSync(join(ROOT, 'lib/widgets/widgetSync.ts'), 'utf8');
    expect(src).toContain('getCategoryColorForMark');
    // The private fallback that bypassed the palette entirely.
    expect(src).not.toContain('#C47E8A');
  });
});
