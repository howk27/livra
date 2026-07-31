/**
 * M9 Phase 5A Task 5 (spec test 8) — mark notes are DELETED and stay deleted.
 *
 * The feature was dead long before deletion: Phase 0 measured `mark_notes` at
 * 3 rows, all support@livralife.com, newest 2026-04-12, and nothing rendered
 * them. This guard fails if any mark-notes / dailyTracking symbol re-enters the
 * app source, so the deletion cannot silently regress.
 *
 * Comments are STRIPPED before matching — this repo has shipped three source
 * scanners that matched prose instead of code.
 */
import fs from 'fs';
import path from 'path';

const ROOTS = ['app', 'components', 'hooks', 'lib', 'state', 'services'];

const EXCLUDED_FILES = [
  // Generated from the live schema; the server table itself is dropped in 5B,
  // after which a regeneration clears this entry.
  path.join('lib', 'data', 'types.ts'),
  // The cutover wipe inventory names the dead SQLite FILE it deletes.
  path.join('lib', 'data', 'cutover.ts'),
];

const FORBIDDEN = [
  /\bmark_notes\b/,
  /\bMarkNote\b/,
  /markNotesSqlite|markNotesSupabase|sqliteClearAllMarkNotes|loadAllMarkNotes/,
  /dailyTracking|DailyTracking/,
];

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const collectHits = (): string[] => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (EXCLUDED_FILES.some((excluded) => full.endsWith(excluded))) continue;
      const src = stripComments(fs.readFileSync(full, 'utf8'));
      for (const pattern of FORBIDDEN) {
        const match = src.match(pattern);
        if (match) {
          hits.push(`${full}: ${match[0]}`);
          break;
        }
      }
    }
  };
  for (const root of ROOTS) walk(path.join(process.cwd(), root));
  return hits;
};

test('no mark_notes or dailyTracking symbol survives in app source', () => {
  expect(collectHits()).toEqual([]);
});
