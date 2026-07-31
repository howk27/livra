/**
 * M9 Phase 5A Task 6 — the old data layer STAYS deleted.
 *
 * Same pattern as the Phase 3 bridge-stays-deleted guard: the cheapest way to
 * resurrect the two-source-of-truth bug is for one of these files to come back
 * "just temporarily". Existence is the violation — no import needed.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../');

const DELETED_FILES = [
  'state/countersSlice.ts',
  'state/eventsSlice.ts',
  'state/goalsSlice.ts',
  'state/checkinsSlice.ts',
  'state/goalNotesSlice.ts',
  'state/goalStore.ts',
  'hooks/useCounters.ts',
];

describe('the retired data layer stays deleted', () => {
  test.each(DELETED_FILES)('%s does not exist', (rel) => {
    expect(existsSync(join(ROOT, rel))).toBe(false);
  });

  test('the lib/db tree does not exist', () => {
    expect(existsSync(join(ROOT, 'lib', 'db'))).toBe(false);
  });

  test('no shipped module imports from the deleted homes', () => {
    // Comment-stripped scan (this repo has shipped scanners that matched prose).
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const code = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        if (
          /from\s+['"][^'"]*(?:state\/(?:counters|events|goals|checkins|goalNotes)Slice|hooks\/useCounters|lib\/db)(?:\/|['"])/.test(
            code,
          )
        ) {
          offenders.push(full);
        }
      }
    };
    for (const root of ['app', 'components', 'hooks', 'lib', 'services', 'state', 'src']) {
      walk(join(ROOT, root));
    }
    expect(offenders).toEqual([]);
  });
});
