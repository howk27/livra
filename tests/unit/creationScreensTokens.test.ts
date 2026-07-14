import { readFileSync } from 'fs';
import { join } from 'path';

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

  // Single source of truth shared by mark/new.tsx and mark/[id]/edit.tsx
  const src = readFileSync(join(ROOT, 'lib/markIcons.ts'), 'utf8');
  const optionsBlock = src.match(/const MARK_ICON_OPTIONS[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';

  it.each(REQUIRED_MARK_TYPES)('offers %s in MARK_ICON_OPTIONS', (markType) => {
    expect(optionsBlock).toContain(`'${markType}'`);
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
      expect(optionsBlock).not.toContain(`'${aiOnly}'`);
    }
  });
});
