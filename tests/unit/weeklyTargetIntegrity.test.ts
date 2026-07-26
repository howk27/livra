import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every path that creates a mark must set its cadence explicitly.
 *
 * The store defaults a missing cadence to a flat 3/week
 * (`weekly_target ?? frequency_recommended ?? 3`, state/countersSlice.ts), and
 * that default is invisible: the mark is created, it works, and it simply asks
 * for the wrong number of days forever. `app/goal/new.tsx` omitted both fields,
 * so a mark the library calls daily (Water at 7, Sleep at 7) came out of the
 * goal screen at 3 and reported "done for the week" after three logs — while
 * the same mark created in onboarding, the AI package or mark/new carried its
 * real cadence. Nothing failed; the numbers just disagreed by origin.
 *
 * weekly_target feeds markWeeklyState, the Focus due logic, goalMomentum's
 * expectedInterval and the consistency maths, so a silent 3 is not cosmetic.
 *
 * This is a source-string guard because none of these screens render in unit
 * tests. It asserts the field is PASSED, not what it resolves to — the value
 * differs by path on purpose (onboarding has a commitment ladder, the AI path
 * carries the model's frequency, the other two use the library recommendation).
 */

const ROOT = join(__dirname, '../../');

/** Every call site that creates a mark, and the call it makes. */
const CREATION_PATHS: Array<[string, string]> = [
  ['app/goal/new.tsx', 'addMark({'],
  ['app/onboarding.tsx', 'addMark({'],
  ['lib/goals/createFromAIPackage.ts', 'addMark({'],
  ['app/mark/new.tsx', 'createCounter({'],
];

/** The argument object of each call to `call` in `src`. */
function callArgs(src: string, call: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf(call, from);
    if (start === -1) break;
    let depth = 0;
    let i = start + call.length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(start, i + 1));
    from = i + 1;
  }
  return out;
}

describe('weekly_target is set on every mark-creation path', () => {
  it.each(CREATION_PATHS)('%s passes weekly_target on every %s', (rel, call) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const calls = callArgs(src, call);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      expect(args).toContain('weekly_target');
    }
  });

  it('the store default that made the drift invisible is still there', () => {
    // If this default is ever removed, the guard above stops being the only
    // thing standing between a missing cadence and a silent 3.
    const slice = readFileSync(join(ROOT, 'state/countersSlice.ts'), 'utf8');
    expect(slice).toContain(
      'markData.weekly_target ?? markData.frequency_recommended ?? 3',
    );
  });

  it('goal/new.tsx forwards the library range, not just the target', () => {
    // It was the one path passing neither, so it is the one worth pinning:
    // frequency_recommended is also the store's second-choice fallback.
    const src = readFileSync(join(ROOT, 'app/goal/new.tsx'), 'utf8');
    const [args] = callArgs(src, 'addMark({');
    for (const field of ['frequency_min', 'frequency_recommended', 'frequency_max']) {
      expect(args).toContain(field);
    }
  });
});
