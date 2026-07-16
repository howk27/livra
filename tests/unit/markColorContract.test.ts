import { readFileSync } from 'fs';
import { join } from 'path';
import { categoryAccents } from '../../theme/tokens';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import {
  CATEGORY_LABELS,
  colorForSuggestedCounter,
  getCategoryColor,
  getCategoryForIcon,
  getCategoryForSuggestedCounter,
  getCategoryColorForMark,
} from '../../lib/markCategory';
import { MARK_ICON_OPTIONS } from '../../lib/markIcons';

/**
 * QC4-M — "the thing you built is the thing you get."
 *
 * The bug: app/mark/new.tsx previewed a popular chip in the library mark's own
 * muted color and then SAVED a color derived from a keyword guess over a
 * fourth, invented taxonomy, resolving to one of five bright generic hexes.
 * Preview and save are now one function, over one taxonomy, from one palette.
 */

const ROOT = join(__dirname, '../../');
const SANCTIONED = new Set<string>(Object.values(categoryAccents));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('mark color comes only from the sanctioned palette (QC4-M)', () => {
  it('every library mark saves a categoryAccents color', () => {
    for (const mark of MARK_LIBRARY) {
      expect(SANCTIONED.has(colorForSuggestedCounter(mark))).toBe(true);
    }
  });

  it('every picker icon derives a categoryAccents color — the custom path never regresses', () => {
    for (const iconType of MARK_ICON_OPTIONS) {
      expect(SANCTIONED.has(getCategoryColor(getCategoryForIcon(iconType)))).toBe(true);
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

  it('resolves a library mark off its own category, not a guess at its name', () => {
    // "Steps" used to hit the Fitness KEYWORD bucket and save orange-500.
    expect(getCategoryForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'steps')!)).toBe('fitness');
    expect(colorForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'steps')!)).toBe(categoryAccents.fitness);
    // Library Sleep is Recovery — the old taxonomy called it "Wellness".
    expect(getCategoryForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'sleep')!)).toBe('recovery');
    // Reading is Deep Work in the real taxonomy, not "Learning".
    expect(getCategoryForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'reading')!)).toBe('deepWork');
    // The founder's yellow: Finance marks land on the warm gold accent.
    expect(colorForSuggestedCounter(MARK_LIBRARY.find(m => m.id === 'saving')!)).toBe(categoryAccents.finance);
  });

  it('an unknown category falls back to the custom accent rather than inventing hex', () => {
    const alien = { ...MARK_LIBRARY[0], category: 'Astrology' };
    expect(getCategoryForSuggestedCounter(alien)).toBe('custom');
    expect(colorForSuggestedCounter(alien)).toBe(categoryAccents.custom);
  });

  it('a stored color still wins for an existing mark — no silent rewrite of user data', () => {
    expect(getCategoryColorForMark({ name: 'Run', color: '#F97316' })).toBe('#F97316');
    // Only a mark with no color at all gets one derived.
    expect(SANCTIONED.has(getCategoryColorForMark({ name: 'Run', color: '' }))).toBe(true);
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
