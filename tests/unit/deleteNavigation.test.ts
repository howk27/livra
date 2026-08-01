/**
 * M9 Phase 6 T1 — a successful delete DISMISSES the modal and never paints the
 * missing-entity guard over the user's own delete.
 *
 * The build-60 report "Mark deleted → screen shows 'Mark not found'" was two
 * defects in one: `router.replace` does not dismiss a `presentation: 'modal'`
 * route, and the not-found guard re-renders the moment the archive mutation
 * drops the row from the query cache — before any navigation lands.
 *
 * Comment-stripped source scan (this repo has shipped scanners that matched
 * prose). Confirmed to fail against the pre-fix code before being kept.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../');

const strip = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('M9 P6 T1 — delete dismisses the modal', () => {
  const mark = strip('app/mark/[id]/index.tsx');
  const goal = strip('app/goal/[id].tsx');

  test('mark delete navigates via router.dismissTo, not router.replace', () => {
    expect(mark).toMatch(/router\.dismissTo\(\s*['"]\/\(tabs\)\/focus['"]/);
    expect(mark).not.toMatch(/router\.replace\(\s*['"]\/\(tabs\)\/focus['"]/);
  });

  test('mark not-found guard yields while a delete is in flight', () => {
    // The guard block must consult the in-flight flag before painting
    // "Mark not found" — suppressing the guard entirely is wrong (it protects
    // the genuinely-missing case), so the flag must live INSIDE the guard.
    // State, not a ref: the guard reads it during render.
    expect(mark).toMatch(/if\s*\(!counter\s*\|\|\s*!id\)\s*\{[\s\S]{0,300}isDeleting/);
  });

  test('mark delete arms the in-flight flag before the archive mutation', () => {
    expect(mark).toMatch(/setIsDeleting\(true\);?[\s\S]{0,200}archiveMark\.mutateAsync/);
  });

  test('goal not-found guard yields while a delete is in flight', () => {
    expect(goal).toMatch(/if\s*\(!goal\)\s*\{[\s\S]{0,300}isDeleting/);
  });

  test('goal delete arms the in-flight flag before the archive mutation', () => {
    expect(goal).toMatch(/setIsDeleting\(true\);?[\s\S]{0,200}archiveGoal\.mutateAsync/);
  });
});
