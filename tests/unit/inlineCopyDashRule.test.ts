import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../../');

// Prose dash = em/en dash with a word char on both sides (optionally spaces between):
// "it — but", "yet — tap", "syncing—try". Does NOT match a lone "—" placeholder cell,
// nor "— /month" / "— $price" decorative separators (non-word char after the dash).
const PROSE_DASH = /\w[ \t]*[—–][ \t]*\w/;

// Strip comments so dashes in code comments/JSDoc (e.g. "MarkCard — Livra 2.0",
// "3–6 → ...") are not flagged. Order matters: block comments first.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// Dependency-free recursive walk for .tsx files under the given roots.
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTsx(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

const FILES = [
  ...walkTsx(join(ROOT, 'app')),
  ...walkTsx(join(ROOT, 'components')),
];

describe('prose dash ban over inline screen copy', () => {
  it.each(FILES)('%s has no prose em/en dash', (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => PROSE_DASH.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });
});
