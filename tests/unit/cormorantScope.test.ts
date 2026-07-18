import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * MED-A (founder 2026-07-18): "Cormorant serif is the issue. The one that looks
 * fancy written. This one needs to be reduced to goal titles, greetings and
 * that's it." Mentor-voice lines move to DM Sans italic; every other Cormorant
 * site moves to DM Sans.
 *
 * This is the source-guard that locks the sweep the way markColorContract locks
 * the palette: the Cormorant families (`fonts.serif` / `fonts.serifSemibold` /
 * `fonts.serifItalic`) may appear ONLY at the sanctioned goal-title + greeting
 * sites, and the retired `fonts.heading` alias must appear nowhere. A new
 * Cormorant reference anywhere else fails here.
 */

const ROOT = join(__dirname, '../../');
const SCAN_DIRS = ['app', 'components', 'theme', 'src'];

// The ONLY files allowed to reference a Cormorant family, each because it is a
// goal title (the user's own goal name rendered as a heading) or the greeting.
const SANCTIONED = new Set<string>([
  'components/ui/GoalTitle.tsx',                    // goal title (card + detail)
  'theme/typography.ts',                            // `greeting` preset (serifItalic)
  'app/(tabs)/focus.tsx',                           // Focus greeting line
  'app/goal/complete.tsx',                          // goal-complete goal title
  'components/overlays/GoalCompletionOverlay.tsx',  // completion overlay goal title
  'app/goal/history.tsx',                           // goal-history goal title
]);

const CORMORANT = /fonts\.(serif|serifSemibold|serifItalic)\b/;
const HEADING_ALIAS = /fonts\.heading\b/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// Normalize to forward-slash relative paths so the assertions read the same on
// Windows and POSIX.
const toRel = (full: string) => relative(ROOT, full).split(sep).join('/');

const sourceFiles = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

describe('Cormorant is reduced to goal titles + greetings (MED-A)', () => {
  it('references Cormorant families ONLY at sanctioned goal-title/greeting sites', () => {
    const offenders: string[] = [];
    for (const full of sourceFiles) {
      const rel = toRel(full);
      if (SANCTIONED.has(rel)) continue;
      if (CORMORANT.test(stripComments(readFileSync(full, 'utf8')))) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every sanctioned file still actually uses a Cormorant family (no stale allowlist)', () => {
    for (const rel of SANCTIONED) {
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      expect(CORMORANT.test(src)).toBe(true);
    }
  });

  it('the retired `fonts.heading` Cormorant alias is referenced nowhere', () => {
    const offenders = sourceFiles
      .filter((full) => HEADING_ALIAS.test(stripComments(readFileSync(full, 'utf8'))))
      .map(toRel);
    expect(offenders).toEqual([]);
  });

  it('mentor-voice italic uses the real DM Sans italic face (sansItalic), which is loaded', () => {
    // Token exists and points at the real italic face.
    const tokens = readFileSync(join(ROOT, 'theme/tokens.ts'), 'utf8');
    expect(tokens).toMatch(/sansItalic:\s*'DMSans_400Regular_Italic'/);

    // The face is actually loaded via useFonts — RN does not synthesize italic
    // for a custom family, so an unloaded face would render as the regular one.
    const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
    expect(layout).toMatch(/DMSans_400Regular_Italic/);
  });
});
