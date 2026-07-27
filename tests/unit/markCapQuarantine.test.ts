// Guard: one mark the server refuses must not stop the whole account syncing.
//
// THE BUG, from the founder's own account 2026-07-26: a free user over
// FREE_MARK_CEILING has one mark refused by RLS. pushChanges threw
// SYNC_PRO_COUNTER_LIMIT, so writePushCursor never ran, so the cursor never
// advanced — and every later sync replayed the same batch, hit the same refusal
// and stopped in the same place. Every unrelated event, streak, badge, goal and
// link queued behind it went with it. Permanently. The diagnosis at the time:
// "a permanent poison pill."
//
// The goal push has done this correctly since M6-B. The mark push did not.
//
// The store half is tested for REAL against the AsyncStorage mock. The wiring
// half is source-level, and runs over COMMENT-STRIPPED source, because this repo
// has four times shipped a guard that matched its own explanatory comment.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  readMarkCapBlockedIds,
  addMarkCapBlockedIds,
  clearMarkCapBlockedIds,
  writeMarkCapBlockedIds,
} from '../../lib/sync/markCapBlocked';
import { readGoalCapBlockedIds, addGoalCapBlockedIds } from '../../lib/sync/goalCapBlocked';

const ROOT = join(__dirname, '../..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SYNC = stripComments(readFileSync(join(ROOT, 'hooks/useSync.ts'), 'utf8'));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('the cap-blocked store', () => {
  it('remembers refused ids across reads', async () => {
    await addMarkCapBlockedIds(['a', 'b']);
    expect((await readMarkCapBlockedIds()).sort()).toEqual(['a', 'b']);
  });

  it('never double-records the same id', async () => {
    await addMarkCapBlockedIds(['a']);
    await addMarkCapBlockedIds(['a', 'b']);
    expect((await readMarkCapBlockedIds()).sort()).toEqual(['a', 'b']);
  });

  it('drops ids that finally pushed, leaving the rest', async () => {
    await addMarkCapBlockedIds(['a', 'b', 'c']);
    await clearMarkCapBlockedIds(['b']);
    expect((await readMarkCapBlockedIds()).sort()).toEqual(['a', 'c']);
  });

  it('empties to nothing rather than storing an empty array', async () => {
    await addMarkCapBlockedIds(['a']);
    await writeMarkCapBlockedIds([]);
    expect(await AsyncStorage.getItem('sync_mark_cap_blocked_ids')).toBeNull();
  });

  it('survives corrupt storage instead of breaking the sync', async () => {
    // An unreadable list must cost a re-attempt, never a thrown push.
    await AsyncStorage.setItem('sync_mark_cap_blocked_ids', 'not json at all');
    await expect(readMarkCapBlockedIds()).resolves.toEqual([]);
  });

  it('ignores non-string entries rather than pushing undefined ids', async () => {
    await AsyncStorage.setItem('sync_mark_cap_blocked_ids', JSON.stringify(['a', 42, null]));
    expect(await readMarkCapBlockedIds()).toEqual(['a']);
  });

  /**
   * Marks and goals share an implementation via createCapBlockedStore. If they
   * ever shared a KEY, upgrading past a goal cap would silently drop a mark from
   * quarantine — the two lists must not see each other.
   */
  it('keeps the mark and goal lists completely separate', async () => {
    await addMarkCapBlockedIds(['mark-1']);
    await addGoalCapBlockedIds(['goal-1']);
    expect(await readMarkCapBlockedIds()).toEqual(['mark-1']);
    expect(await readGoalCapBlockedIds()).toEqual(['goal-1']);
  });
});

describe('pushChanges — a refused mark is quarantined, not fatal', () => {
  it('no longer throws the error that wedged the cursor', () => {
    expect(SYNC).not.toMatch(/throw new Error\('SYNC_PRO_COUNTER_LIMIT'\)/);
  });

  it('records refused ids and advances instead', () => {
    expect(SYNC).toMatch(/addMarkCapBlockedIds\(\[\.\.\.refusedMarkIds\]\)/);
    const record = SYNC.indexOf('addMarkCapBlockedIds');
    const cursor = SYNC.indexOf('await writePushCursor');
    expect(record).toBeGreaterThan(-1);
    expect(cursor).toBeGreaterThan(-1);
    // The cursor must still advance on a run that refused rows — that IS the fix.
    expect(cursor).toBeGreaterThan(record);
  });

  it('re-queries blocked ids outside the cursor, or they are stranded forever', () => {
    // Quarantining moves the cursor PAST these rows, so "dirty since the cursor"
    // will never name them again. Without this read they would survive locally
    // and never reach the server — the "swallow and advance" option that
    // capBlockedIds.ts calls unacceptable.
    expect(SYNC).toMatch(/const capBlockedMarkIds = await readMarkCapBlockedIds\(\)/);
    expect(SYNC).toMatch(/new Set\(\[\.\.\.parentsMissingFromPushSet, \.\.\.capBlockedMarkIds\]\)/);
  });

  it('isolates per row, because a batch cannot say which mark was refused', () => {
    expect(SYNC).toMatch(/for \(const row of batch\)/);
  });

  it('only lets SUCCESSFUL rows become confirmed parents', () => {
    // A refused mark must never enter activeParentIdsUpsertedThisRun, or its
    // events and streaks get pushed against a parent the server does not have.
    const isolation = SYNC.slice(SYNC.indexOf('for (const row of batch)'));
    const block = isolation.slice(0, 900);
    const addParent = block.indexOf('activeParentIdsUpsertedThisRun.add(row.id)');
    const refuse = block.indexOf('refusedMarkIds.add(row.id)');
    expect(addParent).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(-1);
    // The success branch adds the parent and `continue`s before the refusal path.
    expect(addParent).toBeLessThan(refuse);
  });

  it('still aborts on a rejection that is NOT quarantinable', () => {
    // Otherwise this becomes "swallow and advance", which loses rows silently.
    expect(SYNC).toMatch(/if \(!isQuarantinableMarkRejection\(rowError\)\) throw rowError;/);
  });

  /**
   * THE PREDICATE IS THE WHOLE FIX. isProLimitError matches P0001 /
   * FREE_COUNTER_LIMIT_REACHED, which is the legacy trigger dropped on
   * 2026-07-27. The surviving RESTRICTIVE RLS layer raises 42501. If the
   * quarantine hangs on the old predicate alone it is dead code in production
   * and the poison pill is still live.
   */
  it('recognises the RLS code the surviving enforcement layer actually raises', () => {
    expect(SYNC).toMatch(/isQuarantinableMarkRejection = \(error: any\): boolean =>/);
    expect(SYNC).toMatch(/error\?\.code === '42501'/);
  });

  it('forgets blocked marks that no longer exist locally', () => {
    // Without this an id nothing can ever push is re-queried for the life of the
    // install.
    expect(SYNC).toMatch(/const vanishedBlockedIds = capBlockedMarkIds\.filter/);
    expect(SYNC).toMatch(/clearMarkCapBlockedIds\(vanishedBlockedIds\)/);
  });
});
