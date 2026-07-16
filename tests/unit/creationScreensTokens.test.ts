import { readFileSync } from 'fs';
import { join } from 'path';
import { MARK_ICON_OPTIONS, MARK_ICON_PRIMARY, MARK_ICON_SECONDARY } from '../../lib/markIcons';

/**
 * VD-7 acceptance guards for the creation flows.
 *
 * 1. Zero hardcoded hex colors (and no `+ 'XX'` alpha concats) in the manual
 *    creation screens — color always comes from theme/tokens.ts roles or the
 *    category-derived color, alphas only via applyOpacity().
 * 2. Icon parity: the manual icon grid covers every AI icon domain that is
 *    representable as an existing MarkType (the unmappable remainder is
 *    documented in the VD-7 build report, not silently dropped).
 */

const ROOT = join(__dirname, '../../');

const CREATION_SURFACES = [
  'app/mark/new.tsx',
  'app/mark/[id]/edit.tsx',
  'app/goal/new.tsx',
  'components/CommitmentScreen.tsx',
];

// Hex color literal in a string: '#FFF', '#FFFFFF', '#FFFFFF80'
const HEX_LITERAL = /['"]#[0-9a-fA-F]{3,8}['"]/;
// Alpha-suffix concat onto a color variable: c.forest + '18'
const ALPHA_CONCAT = /\+\s*['"][0-9a-fA-F]{2}['"]/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('creation screens use tokens only (VD-7)', () => {
  it.each(CREATION_SURFACES)('%s has no hardcoded hex colors', (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => HEX_LITERAL.test(line) || ALPHA_CONCAT.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });
});

// QC4-F: MARK_ICON_OPTIONS is now composed from PRIMARY + SECONDARY, so the old
// source-regex over its literal array block no longer sees the members. Assert
// against the real exported arrays instead — stronger, and immune to formatting.
describe('manual icon grid parity with the AI icon set (VD-7)', () => {
  // Every AI icon (lib/ai/goalGeneration.ts VALID_ICONS) that has an existing
  // MarkType equivalent must be offered in the manual grid. AI keys with no
  // MarkType are intentionally absent (see VD-7 build report "unmappable").
  const REQUIRED_MARK_TYPES = [
    // direct AI-set members
    'gym', 'sleep', 'reading', 'meditation', 'water', 'study', 'focus',
    'tasks', 'planning', 'language', 'rest', 'steps', 'calories',
    'gratitude', 'journaling',
    // AI domains carried by an existing MarkType
    'no_beer', // no-alcohol
    'screen_free', // screen-time
    'no_spending', // finance / saving
  ];

  it.each(REQUIRED_MARK_TYPES)('offers %s in MARK_ICON_OPTIONS', (markType) => {
    expect(MARK_ICON_OPTIONS).toContain(markType);
  });

  it('is imported by both mark screens (no local copies)', () => {
    for (const rel of ['app/mark/new.tsx', 'app/mark/[id]/edit.tsx']) {
      const screen = readFileSync(join(ROOT, rel), 'utf8');
      expect(screen).toContain('lib/markIcons');
      expect(screen).not.toMatch(/const ICON_TYPE_TO_EMOJI/);
    }
  });

  it('does not invent icon keys outside MarkType', () => {
    // AI-only keys that must NOT appear (no MarkType exists for them)
    for (const aiOnly of ['run', 'stretch', 'nutrition', 'meal-prep', 'breathwork', 'wake-early', 'socialize', 'family', 'creative', 'writing', 'saving', 'finance']) {
      expect(MARK_ICON_OPTIONS).not.toContain(aiOnly as never);
    }
  });
});

/**
 * QC4-F guards — the icon picker's progressive disclosure.
 *
 * Founder: "Icons need a expandable menu instead of showing them all out.
 * Organize Icons into 4x4 grid and create a 'Show more' button."
 */
describe('icon picker disclosure (QC4-F)', () => {
  it('the collapsed grid is exactly one 4x4', () => {
    expect(MARK_ICON_PRIMARY).toHaveLength(16);
  });

  it('PRIMARY and SECONDARY partition MARK_ICON_OPTIONS with no overlap or loss', () => {
    expect(MARK_ICON_OPTIONS).toEqual([...MARK_ICON_PRIMARY, ...MARK_ICON_SECONDARY]);
    expect(new Set(MARK_ICON_OPTIONS).size).toBe(MARK_ICON_OPTIONS.length);
  });

  it('expanding only appends — the visible 16 never reflow', () => {
    expect(MARK_ICON_OPTIONS.slice(0, MARK_ICON_PRIMARY.length)).toEqual(MARK_ICON_PRIMARY);
  });

  it('every founder-curated popular mark has its icon in the collapsed grid', () => {
    // POPULAR_MARK_IDS (app/mark/new.tsx) → the icon a user reaches for after
    // seeing that chip. run/workout both resolve to gym.
    for (const iconType of ['gym', 'reading', 'meditation', 'water', 'sleep', 'journaling', 'study'] as const) {
      expect(MARK_ICON_PRIMARY).toContain(iconType);
    }
  });

  it('the restraint set is the part held behind the disclosure', () => {
    // Leading with a wall of "no" glyphs is the guilt-forward first impression
    // PRODUCT.md rules out — they stay one tap away, not gone.
    for (const iconType of ['no_beer', 'no_smoking', 'no_sugar', 'no_spending', 'soda_free', 'screen_free'] as const) {
      expect(MARK_ICON_SECONDARY).toContain(iconType);
      expect(MARK_ICON_PRIMARY).not.toContain(iconType);
    }
  });

  it('the grid renders the collapsed set behind a real 44pt disclosure target', () => {
    const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');
    // Renders the sliced set, not the full list.
    expect(src).toMatch(/visibleIconOptions\.map/);
    expect(src).toMatch(/iconsExpanded \|\| !selectedIconIsPrimary/);
    // Disclosure target comes off the shared HIG token, and is a real box —
    // hitSlop clips at the parent's bounds and can never be trusted for this.
    expect(src).toMatch(/iconDisclosure:\s*\{[\s\S]*?minHeight:\s*headerControl\.minTarget/);
    expect(stripComments(src)).not.toMatch(/hitSlop/);
  });
});

/**
 * QC4-I guard — the mark being built stays visible while the user scrolls.
 *
 * Founder: "Can we make the mark that's getting built scroll down with the
 * view? So users can still see it when going down."
 */
describe('mark/new keeps the live preview visible while scrolling (QC4-I)', () => {
  const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');

  it('pins the preview block as the sticky first child', () => {
    expect(src).toMatch(/stickyHeaderIndices=\{\[0\]\}/);
    expect(src).toMatch(/styles\.previewSticky/);
  });

  it('does it without reintroducing the QC2-D half-render class', () => {
    // KeyboardAvoidingView (keyboard-driven paddingBottom on a native
    // pageSheet) was the VD-6/QC2-D root cause. Sticky headers are plain
    // ScrollView layout — no keyboard coupling, no LayoutAnimation.
    const code = stripComments(src);
    expect(code).not.toMatch(/<KeyboardAvoidingView/);
    expect(code).not.toMatch(/LayoutAnimation/);
  });

  it('does not leave a paddingTop above the sticky header for content to show through', () => {
    const block = src.match(/scrollContent:\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(block).not.toMatch(/paddingTop:/);
  });
});

/**
 * QC4-J guard — the "What you'll do" placeholder alignment.
 *
 * Symmetric `padding` on a single-line TextInput with no height lets RN inset
 * the text rect and the native placeholder rect independently, so the two land
 * on different baselines. Height + horizontal-only padding is the shape every
 * other input in the app already uses.
 */
describe('mark/new name input alignment (QC4-J)', () => {
  it('inputInCard is sized, not symmetrically padded', () => {
    const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');
    const block = src.match(/inputInCard:\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(block).toMatch(/height:\s*48/);
    expect(block).toMatch(/paddingHorizontal:\s*spacing\.md/);
    // The bug: `padding: <x>` (all four sides) on a single-line field.
    expect(block).not.toMatch(/\bpadding:/);
    expect(block).not.toMatch(/paddingVertical:/);
  });
});

/**
 * QC4-H guard — the popular chips spend the full width.
 */
describe('popular marks use the full row width (QC4-H)', () => {
  it('chips are laid out as fixed columns derived from the screen width', () => {
    const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');
    expect(src).toMatch(/POPULAR_GRID_COLUMNS/);
    expect(src).toMatch(/width:\s*popularChipWidth/);
    // Derived from the gutter + gap, never a literal width.
    expect(src).toMatch(/SCREEN_WIDTH - spacing\.lg \* 2/);
  });

  it('keeps the 44pt tap-target floor', () => {
    const src = readFileSync(join(ROOT, 'app/mark/new.tsx'), 'utf8');
    const block = src.match(/popularChip:\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    expect(block).toMatch(/minHeight:\s*44/);
  });
});
