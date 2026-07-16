import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * QC2-H acceptance guards — "The Card Takes Shape" creation flows.
 *
 * 1. The artifact is present: goal creation renders the live GoalCardPreview
 *    (both steps), mark creation renders the live MarkRowPreview (both the
 *    custom bench and the suggested pick).
 * 2. The previews are REUSED real components, not hand-rolled lookalikes:
 *    GoalCardPreview renders through GoalTitle + the FU-5 hollow treatment,
 *    MarkRowPreview renders the real Focus MarkRow via the Focus resolution
 *    pipeline (lib/creation/creationPreview).
 * 3. Uppercase tracked kickers are gone from every creation surface
 *    (design-system ban; impeccable "eyebrow on every section" flag).
 */

const ROOT = join(__dirname, '../../');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const CREATION_SURFACES = [
  'app/goal/new.tsx',
  'app/mark/new.tsx',
  'components/CommitmentScreen.tsx',
  'components/creation/GoalCardPreview.tsx',
  'components/creation/MarkRowPreview.tsx',
];

describe('the artifact anchors every creation screen (QC2-H)', () => {
  // QC4-E supersedes QC2-H's caret-in-card on THIS screen: with the caret
  // inside it, the card only contained the user's keystrokes and nothing
  // answered ("just text" — founder). The artifact is now read-only and the
  // caret lives in the instrument group below it. The QC2-H requirement the
  // guard actually protects — the REAL live card anchors the screen — is
  // unchanged, so the assertion moves rather than relaxing.
  it('goal/new assembles the live goal card as a read-only artifact, caret outside it', () => {
    // stripComments: the screen's comments name titleSlot to record what
    // superseded it, and that prose must not trip the guard.
    const src = stripComments(read('app/goal/new.tsx'));
    expect(src).toContain('<GoalCardPreview');
    expect(src).toContain('title={title}');
    // The card is an object, not an input: no caret may live inside it again.
    expect(src).not.toContain('titleSlot');
  });

  it('the commitment step keeps the same card and feeds it the plan', () => {
    const src = read('components/CommitmentScreen.tsx');
    expect(src).toContain('<GoalCardPreview');
    expect(src).toContain('planMeta');
    expect(src).toContain('goalPlanMeta(');
  });

  it('mark/new assembles ONE live Focus row that fills from either path (QC3-G)', () => {
    const src = read('app/mark/new.tsx');
    // QC3-G unified the add-a-mark surface to a single shared preview (the
    // Suggested/Custom toggle is gone): one MarkRowPreview, fed from whichever
    // path the user last touched — a staged popular chip OR the custom fields.
    const previews = src.match(/<MarkRowPreview/g) ?? [];
    expect(previews.length).toBe(1);
    expect(src).toContain('name={previewName}');
    expect(src).toContain('pendingSuggestedCounter ? pendingSuggestedCounter.name : name');
  });
});

describe('the previews are the real components, not lookalikes (QC2-H)', () => {
  it('GoalCardPreview reuses GoalTitle and the FU-5 hollow treatment', () => {
    const src = read('components/creation/GoalCardPreview.tsx');
    expect(src).toContain("from '../ui/GoalTitle'");
    // FU-5: hairline accent border + translucent forest wash.
    expect(src).toContain('applyOpacity(c.accent, 0.55)');
    expect(src).toContain('applyOpacity(c.forest,');
  });

  it('MarkRowPreview reuses the real MarkRow through the Focus resolution pipeline', () => {
    const src = read('components/creation/MarkRowPreview.tsx');
    expect(src).toContain("from '../ui/MarkRow'");
    expect(src).toContain('markPreviewIdentity');
  });

  it('assembly motion uses the existing vocabulary and respects reduced motion', () => {
    for (const rel of ['components/creation/GoalCardPreview.tsx', 'components/creation/MarkRowPreview.tsx']) {
      const src = read(rel);
      expect(src).toContain('useMotion');
      expect(src).toContain('reduced');
    }
  });
});

describe('uppercase tracked kickers are dead on creation surfaces (QC2-H)', () => {
  it.each(CREATION_SURFACES)('%s has no uppercase kicker styling', (rel) => {
    const src = stripComments(read(rel));
    expect(src).not.toMatch(/textTransform:\s*'uppercase'/);
    // The all-caps literals the kickers carried.
    expect(src).not.toMatch(/THE WORK|HOW MUCH|HOW OFTEN|TIMES/);
  });
});
