import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Copy modules: files that are ALL copy, where the whole source is held to the
 * rule (their comments say so themselves — see lib/moments/content.ts).
 */
const COPY_MODULES = [
  'lib/copy.ts',
  'lib/weeklyReflectionCopy.ts',
  'components/ui/GoalHeroStep.tsx',
  'lib/moments/content.ts',
  'lib/auth/accountCredentials.ts',
];

/**
 * Files that CARRY copy among ordinary code. Only what the user can read is
 * held to the rule (string literals AND JSX text, via comment stripping): the
 * prose is what the rule is about, and the house comment style uses em dashes
 * everywhere. app/settings/profile.tsx is the largest user-facing copy block of
 * the account batch and was the one unguarded file (it was clean; this is how
 * it stays); emailVerification.ts owns the verification sentences.
 */
const COPY_CARRYING_SOURCES = [
  'app/settings/profile.tsx',
  'lib/auth/emailVerification.ts',
];

// Matches single-quoted, double-quoted, and backtick string literals (no escaped
// quote handling needed for our copy, which contains none).
const STRING_LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;

function read(rel: string): string {
  return readFileSync(join(__dirname, '../../', rel), 'utf8');
}

function literalOffenders(src: string, pattern: RegExp): string[] {
  const literals = src.match(STRING_LITERAL) ?? [];
  return literals.filter((lit) => pattern.test(lit));
}

/**
 * A screen's copy is not all in string literals: half of it is JSX text. So the
 * check runs over the source with COMMENTS removed instead, which catches both
 * and leaves the house comment style (em dashes everywhere) alone. `//` inside
 * a URL is left in place.
 */
function stripComments(src: string): string {
  return src
    .replace(/\r\n/g, '\n') // CRLF checkouts: JS `.` does not match \r, so a
    .replace(/\/\*[\s\S]*?\*\//g, '') // trailing one would defeat the line rule
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
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
    expect(literalOffenders(read(rel), / - /)).toEqual([]);
  });
});

/**
 * JSX text nodes: what sits between a closing `>` and the next opening `<`.
 * Rough on purpose — it over-collects a little, which is the safe direction for
 * a guard, and it is only ever asked about dashes.
 */
function jsxText(src: string): string[] {
  return [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).filter((t) => /\S/.test(t));
}

describe('dash rule over copy-carrying sources (what the user can read)', () => {
  // Em and en dashes never appear in code, so the whole comment-stripped source
  // is fair game for them.
  it.each(COPY_CARRYING_SOURCES)('%s shows the user no em-dash or en-dash', (rel) => {
    const offenders = stripComments(read(rel))
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /[—–]/.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  // A SPACED HYPHEN is different: ` - ` is also how subtraction is written, and
  // a line-wise scan cannot tell `nowMs - sentAtMs` from prose. It flagged
  // exactly that in the resend cooldown's arithmetic, 2026-07-25 (k). So this
  // half runs over what the user can actually read — string literals and JSX
  // text — instead of over every line that happens to contain a minus sign.
  it.each(COPY_CARRYING_SOURCES)('%s uses no hyphen-as-dash in what it says', (rel) => {
    const src = stripComments(read(rel));
    expect(literalOffenders(src, / - /)).toEqual([]);
    expect(jsxText(src).filter((t) => / - /.test(t))).toEqual([]);
  });
});
