// Guard: a push rejection must NEVER suppress the restore pull.
//
// Founder device report 2026-07-22: "a further reinstall lost ALL goals and marks
// (empty screen)". executeSync awaited pushChanges and only then called
// pullChanges, so any throw skipped the pull entirely — and pushChanges rethrows
// every server rejection that is not isProLimitError, which a RESTRICTIVE RLS
// violation (42501, e.g. a stale marks-cap policy) is not. Fresh install →
// re-onboard → push the new marks → server rejects one → sync aborts → the
// restore pull never runs, and every later sync repeats it identically.
//
// Source-level assertions, matching markGoalIdSync.test.ts: the real round-trip
// needs a live Supabase, so these pin the ordering that made the data reachable.
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '../../hooks/useSync.ts'), 'utf8');

describe('executeSync — the restore pull runs even when the push fails', () => {
  it('wraps pushChanges in a try/catch instead of letting it abort the sync', () => {
    expect(SRC).toMatch(/try\s*\{\s*await pushChanges\(user\.id\);\s*\}\s*catch/);
  });

  it('never awaits pushChanges unguarded inside executeSync', () => {
    const executeSyncBody = SRC.slice(SRC.indexOf('const executeSync'));
    const pushCalls = executeSyncBody.match(/await pushChanges\(user\.id\)/g) ?? [];
    // Exactly one call site, and it is the guarded one asserted above.
    expect(pushCalls).toHaveLength(1);
  });

  it('calls pullChanges BEFORE rethrowing the push error', () => {
    const pullIndex = SRC.indexOf('await pullChanges(user.id)');
    const rethrowIndex = SRC.indexOf('if (pushError) throw pushError');
    expect(pullIndex).toBeGreaterThan(-1);
    expect(rethrowIndex).toBeGreaterThan(-1);
    expect(rethrowIndex).toBeGreaterThan(pullIndex);
  });

  it('still surfaces the push failure rather than swallowing it', () => {
    expect(SRC).toMatch(/if \(pushError\) throw pushError;/);
  });
});
