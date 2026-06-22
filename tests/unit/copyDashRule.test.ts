import { readFileSync } from 'fs';
import { join } from 'path';

const COPY_MODULES = ['lib/copy.ts', 'lib/weeklyReflectionCopy.ts'];

// Matches single-quoted, double-quoted, and backtick string literals (no escaped
// quote handling needed for our copy, which contains none).
const STRING_LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;

function read(rel: string): string {
  return readFileSync(join(__dirname, '../../', rel), 'utf8');
}

describe('dash rule over copy modules', () => {
  it.each(COPY_MODULES)('%s has no em-dash or en-dash anywhere', (rel) => {
    const src = read(rel);
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /[—–]/.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it.each(COPY_MODULES)('%s has no hyphen-as-dash inside string literals', (rel) => {
    const src = read(rel);
    const literals = src.match(STRING_LITERAL) ?? [];
    const offenders = literals.filter((lit) => / - /.test(lit));
    expect(offenders).toEqual([]);
  });
});
