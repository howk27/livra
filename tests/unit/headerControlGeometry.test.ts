import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { spacing, headerControl, headerControlBoxLeading, headerControlBoxTrailing } from '../../theme/tokens';

/**
 * QC4-K guard — screen header chrome geometry (back / close / edit controls).
 *
 * Founder report: "the buttons (back or edit) are way too high which makes it
 * hard to click on it without doing something else (ex: closing the screen)".
 * Two root causes, both locked here:
 *
 *   1. Headers sat flush against the safe-area top inset, putting the control in
 *      the notch / Dynamic Island / system-gesture strip. Every header row now
 *      offsets by `headerControl.topGap` below the inset — the SAME value on
 *      every screen, so the control lands at one consistent height app-wide.
 *   2. Targets were under the 44pt iOS HIG minimum (hitSlop 8 on a 22pt icon,
 *      40x40 buttons, bare Texts with no touch box at all).
 *
 * Geometry lives in `theme/tokens` only — a screen that re-derives the offset or
 * the target size locally has broken the convergence, so these assertions pin
 * the token references in source, not the literal numbers.
 */

const ROOT = join(__dirname, '../../');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function styleBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`\\b${name}:\\s*\\{([\\s\\S]*?)\\n  \\}`));
  if (!m) throw new Error(`style block "${name}" not found`);
  return m[1];
}

describe('headerControl tokens (QC4-K)', () => {
  it('minTarget meets the 44pt iOS HIG minimum', () => {
    expect(headerControl.minTarget).toBeGreaterThanOrEqual(44);
  });

  it('topGap is a real offset taken off the shared spacing scale', () => {
    // Not a magic number: it must BE a step on the scale, and it must be a
    // meaningful gap — flush (0) or hairline values are the bug being fixed.
    expect(Object.values(spacing)).toContain(headerControl.topGap);
    expect(headerControl.topGap).toBe(spacing.md);
    expect(headerControl.topGap).toBeGreaterThan(spacing.sm);
  });

  it('control boxes are >= 44pt and edge-anchored, not centre-anchored', () => {
    for (const box of [headerControlBoxLeading, headerControlBoxTrailing]) {
      expect(box.minWidth).toBeGreaterThanOrEqual(44);
      expect(box.minHeight).toBeGreaterThanOrEqual(44);
      expect(box.justifyContent).toBe('center');
    }
    // Edge-anchored so growing the target to 44 does not shift the control off
    // the screen gutter its screen content aligns to.
    expect(headerControlBoxLeading.alignItems).toBe('flex-start');
    expect(headerControlBoxTrailing.alignItems).toBe('flex-end');
  });
});

// (file, style block) — the block that owns the gap between the safe-area inset
// and the first header control on that screen.
const TOP_GAP_SITES: [string, string][] = [
  ['app/goal/new.tsx', 'header'],
  ['app/mark/new.tsx', 'header'],
  ['app/goal/[id].tsx', 'header'],
  ['app/goal/journal/[id].tsx', 'header'],
  ['app/goal/history.tsx', 'header'],
  ['app/goal/suggest.tsx', 'header'],
  ['app/legal/privacy-policy.tsx', 'header'],
  ['app/legal/terms-and-conditions.tsx', 'header'],
  ['app/iap-dashboard.tsx', 'header'],
  // Screens whose header is the first child of a padded scroll body — the page
  // padding is what sets the offset there.
  ['app/mark/[id]/edit.tsx', 'content'],
  ['app/paywall.tsx', 'content'],
  ['app/auth/reset-password.tsx', 'content'],
  ['app/auth/reset-password-complete.tsx', 'content'],
  // QC5-C: a COMPONENT, not a screen — goal/new renders it as the "Set the plan"
  // step, so it owns a real back control the founder actually hits. QC4-K's sweep
  // and this list were both app/-only, which is why it kept the failing geometry
  // after QC4-K "fixed" the note app-wide. The discovery guard below is what stops
  // the next one; this entry pins the fix.
  ['components/CommitmentScreen.tsx', 'container'],
];

describe('every screen header offsets from the safe-area inset (QC4-K)', () => {
  it.each(TOP_GAP_SITES)('%s › %s uses headerControl.topGap', (rel, name) => {
    const block = styleBlock(read(rel), name);
    expect(block).toMatch(/paddingTop:\s*headerControl\.topGap/);
    // A surviving symmetric paddingVertical would silently re-pin the top gap
    // to a local value and undo the convergence.
    expect(block).not.toMatch(/paddingVertical:/);
  });

  it('LivraHeader offsets its row below the inset rather than sitting flush', () => {
    const src = read('components/ui/LivraHeader.tsx');
    expect(src).toMatch(/insets\.top \+ headerControl\.topGap/);
    // The old flush treatment.
    expect(src).not.toMatch(/paddingTop:\s*insets\.top\s*[},]/);
  });
});

// Header controls whose touch box comes from a shared 44pt box token.
const BOX_SITES: [string, string][] = [
  ['components/ui/LivraHeader.tsx', 'iconBtn'],
  ['components/ui/LivraHeader.tsx', 'iconBtnRight'],
  ['app/goal/new.tsx', 'headerBtn'],
  ['app/mark/new.tsx', 'headerBtn'],
  ['app/goal/[id].tsx', 'headerBtn'],
  ['app/goal/[id].tsx', 'headerBtnRight'],
  ['app/goal/journal/[id].tsx', 'headerBtn'],
  ['app/goal/history.tsx', 'headerBtn'],
  ['app/goal/suggest.tsx', 'headerBtn'],
  ['app/mark/[id]/edit.tsx', 'headerBtn'],
  ['app/mark/[id]/edit.tsx', 'headerBtnRight'],
  ['app/paywall.tsx', 'headerBtn'],
];

// Header controls sized explicitly (they carry a background/border, so they need
// a real width/height rather than a min-box).
const EXPLICIT_SIZE_SITES: [string, string][] = [
  ['app/legal/privacy-policy.tsx', 'backButton'],
  ['app/legal/terms-and-conditions.tsx', 'backButton'],
  ['app/iap-dashboard.tsx', 'backButton'],
  ['app/auth/reset-password.tsx', 'backButton'],
  ['app/auth/reset-password-complete.tsx', 'backButton'],
];

describe('every back/close/edit control reaches 44x44 (QC4-K)', () => {
  it.each(BOX_SITES)('%s › %s spreads a shared headerControlBox', (rel, name) => {
    const block = styleBlock(read(rel), name);
    expect(block).toMatch(/\.\.\.headerControlBox(Leading|Trailing)/);
  });

  it.each(EXPLICIT_SIZE_SITES)('%s › %s is sized from headerControl.minTarget', (rel, name) => {
    const block = styleBlock(read(rel), name);
    expect(block).toMatch(/width:\s*headerControl\.minTarget/);
    expect(block).toMatch(/height:\s*headerControl\.minTarget/);
  });

  // The founder-reported failure mode: a bare hitSlop standing in for a real
  // touch box on the control that dismisses the screen. hitSlop also clips at
  // the parent's bounds, so it could never be trusted to deliver 44pt here.
  it.each([...new Set([...TOP_GAP_SITES, ...BOX_SITES].map(([rel]) => rel))])(
    '%s has no hitSlop-only back/close control left',
    (rel) => {
      const offenders = read(rel)
        .split('\n')
        .filter((l) => /router\.back\(\)/.test(l) && /hitSlop/.test(l));
      expect(offenders).toEqual([]);
    },
  );
});

/**
 * QC5-C — the guard that finds its own subjects.
 *
 * TOP_GAP_SITES above is a hand-maintained list, and that is precisely how
 * `components/CommitmentScreen.tsx` kept a back control with NO touch box and a
 * half-size top gap through the whole of QC4-K: the sweep looked at `app/`, this
 * list named only `app/` files, and the screen the founder was actually hitting
 * lives in `components/`. They reported the same note twice as a result.
 *
 * Adding one entry fixes today; this fixes tomorrow. It asserts the coarse thing
 * that actually failed — a surface owning a back control while never referencing
 * the geometry contract at all — rather than trying to parse JSX with a regex.
 * A first attempt matched style NAMES and immediately flagged three innocents (a
 * text-only `cancelButton` label whose box lives on its parent, a modal dialog
 * button, and comments recording hitSlop's removal). A guard that cries wolf gets
 * switched off, so this one only asks a question it can answer correctly.
 */
describe('QC5-C — a surface with a back control must know the contract', () => {
  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(rel); }
        else if (e.name.endsWith('.tsx')) out.push(rel);
      }
    };
    walk('app');
    walk('components');
    return out;
  }

  /**
   * Surfaces that own a back/close control but legitimately do not set its
   * geometry themselves. Each needs a REASON, not just a name.
   */
  const EXEMPT: Record<string, string> = {
    'components/ui/LivraHeader.tsx': 'owns the contract for the 7 screens that use it; asserted directly above',
    'app/_layout.tsx': 'navigator config, renders no control of its own',
  };

  // Comments are prose, not contract. Without this the guard reads a comment
  // that MENTIONS headerControl.topGap and passes a file that never calls it —
  // which is exactly what happened when this test was first mutation-tested.
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  }

  it('every surface with a back control references headerControl geometry', () => {
    const offenders: string[] = [];
    for (const rel of sourceFiles()) {
      if (EXEMPT[rel]) continue;
      const src = stripComments(read(rel));
      // A real back control: a press handler that pops, or a screen taking an
      // onBack prop and rendering it. Modal onClose/dismiss is a different thing.
      const ownsBackControl = /onPress=\{\s*\(?\)?\s*=>\s*router\.back\(\)/.test(src)
        || /onPress=\{router\.back\}/.test(src)
        || /onPress=\{onBack\}/.test(src);
      if (!ownsBackControl) continue;
      // It must reference the app's geometry contract somehow — either the box
      // helpers, the tokens, or the shared header component.
      const knowsContract = /headerControlBox(Leading|Trailing)|headerControl\.(minTarget|topGap)|LivraHeader/.test(src);
      if (!knowsContract) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
