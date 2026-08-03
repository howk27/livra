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
    // This used to assert the literal expressions `applyOpacity(c.accent, 0.55)`
    // and `applyOpacity(c.forest,` in this file — a proxy for "wears the same
    // treatment as the Goals card", which held only while both files happened to
    // spell it identically. They no longer spell it at all: 2026-08-03 moved the
    // treatment into theme/goalCardSurface.ts because the light card was reading
    // greyed-out and had to be fixed in both places at once. Asserting the SHARED
    // SOURCE is what the guard was always reaching for, and it cannot drift.
    //
    // stripComments because this file's own comments name goalCardSurface — the
    // sixth time a source-scanner in this repo would otherwise match prose.
    const src = stripComments(read('components/creation/GoalCardPreview.tsx'));
    expect(src).toContain("from '../ui/GoalTitle'");
    expect(src).toContain("from '../../theme/goalCardSurface'");
    expect(src).toContain('goalCardSurface(theme)');
  });

  it('the Goals card and the creation preview share ONE treatment', () => {
    // The preview promises the card the user is about to get. If either side
    // stops calling the shared module, the promise is broken silently.
    const preview = stripComments(read('components/creation/GoalCardPreview.tsx'));
    const goalsTab = stripComments(read('app/(tabs)/goals.tsx'));
    for (const src of [preview, goalsTab]) {
      expect(src).toContain('goalCardSurface(theme)');
      // The old inline wash must not come back alongside the shared call.
      expect(src).not.toContain('applyOpacity(c.forest, theme');
    }
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
