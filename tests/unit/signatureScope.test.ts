import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * Founder 2026-09-20: the script face is the person's SIGNATURE on their own
 * week — "use a special signature font for the name and we'll put it in a
 * corner". It is not a typeface for chrome, and a second site would turn a
 * signature into decoration.
 *
 * Same shape as the Cormorant scope guard: `fonts.signature` may appear only
 * where the signature is rendered. Anywhere else fails here.
 */

const ROOT = join(__dirname, '../../');
const SCAN_DIRS = ['app', 'components', 'src'];

const SANCTIONED = new Set<string>([
  'components/WeeklyStoryCard.tsx', // the signature on the weekly story card
]);

const SIGNATURE = /fonts\.signature\b/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('signature font scope', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('scans a real tree (the guard itself is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('only the sanctioned site references fonts.signature', () => {
    const offenders = files
      .filter((f) => SIGNATURE.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f).split(sep).join('/'))
      .filter((rel) => !SANCTIONED.has(rel));
    expect(offenders).toEqual([]);
  });

  it('the sanctioned site actually uses it (the list never outlives the code)', () => {
    for (const rel of SANCTIONED) {
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      expect(SIGNATURE.test(src)).toBe(true);
    }
  });
});
