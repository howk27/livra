import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every path that creates a mark must set its cadence explicitly.
 *
 * HISTORY. The store defaulted a missing cadence to a flat 3/week
 * (`weekly_target ?? frequency_recommended ?? 3`, state/countersSlice.ts), and
 * that default was invisible: `app/goal/new.tsx` omitted both fields, so a mark
 * the library calls daily (Water at 7, Sleep at 7) came out of the goal screen
 * at 3 and reported "done for the week" after three logs. This file used to pin
 * `weekly_target` into every `addMark({`/`createCounter({` call as a
 * source-string guard, because none of these screens render in unit tests.
 *
 * M9 Phase 3 Task 6 (2026-07-31) moved every creation path onto
 * `lib/data/mutations/marks.ts`, where the WHOLE cadence set is REQUIRED at the
 * type level (`cadence: MarkCadence`, every field non-optional) — a caller that
 * forgets one is a `tsc` error, which is strictly stronger than this scan ever
 * was. What is left to guard here is the migration itself:
 *
 *   1. No creation surface may quietly return to the store path (`addMark(` /
 *      `createCounter(`), because the store's silent-3 default still exists in
 *      the retired code and would make the drift invisible again.
 *   2. The type-level contract that replaced this file's old assertion must
 *      itself stay REQUIRED — `cadence?:` would put the silent default one
 *      refactor away.
 *
 * COMMENTS ARE STRIPPED before matching (this repo has shipped guards that
 * measured prose); the retired implementations in state/countersSlice.ts and
 * hooks/useCounters.ts are deliberately NOT scanned — they keep the old calls
 * until Phase 5 deletes them whole.
 */

const ROOT = join(__dirname, '../../');

/** Every surface that creates a mark, all through the mutation layer now. */
const CREATION_SURFACES = [
  'app/goal/new.tsx',
  'app/onboarding.tsx',
  'lib/goals/createFromAIPackage.ts',
  'app/mark/new.tsx',
  'hooks/useCreateMark.ts',
];

/** Same string-safe comment stripper the screen-migration guard uses. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

describe('mark creation goes through the mutation layer, nowhere else', () => {
  it.each(CREATION_SURFACES)('%s does not call the store creation path', (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    expect(src).not.toContain('addMark(');
    expect(src).not.toContain('createCounter(');
  });

  it.each(CREATION_SURFACES.filter((f) => f !== 'hooks/useCreateMark.ts'))(
    '%s passes a full cadence object to its create call',
    (rel) => {
      // The type system enforces the SHAPE; this pins that the surface builds a
      // cadence at all rather than delegating to some future default.
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      expect(src).toContain('cadence: {');
      expect(src).toContain('weekly_target');
    },
  );

  it('the mutation keeps the whole cadence set REQUIRED at the type level', () => {
    // `cadence: MarkCadence;` non-optional in CreateMarkInput is the guarantee
    // that replaced the old per-call source scan. Making it optional would put
    // the silent-3 era one refactor away. Scoped to CreateMarkInput because
    // EditMarkChanges is partial BY DESIGN (an absent key must stay absent).
    const src = stripComments(
      readFileSync(join(ROOT, 'lib/data/mutations/marks.ts'), 'utf8'),
    );
    const start = src.indexOf('interface CreateMarkInput');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('}', start));
    expect(block).toContain('cadence: MarkCadence;');
    expect(block).not.toContain('cadence?:');
  });
});
