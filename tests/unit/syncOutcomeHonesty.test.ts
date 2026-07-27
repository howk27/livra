// Guard: a sync that did not sync must not be announced as one.
//
// `sync()` used to resolve with `void`, so FOUR different non-events were
// indistinguishable from success at the call site, and settings.tsx duly fired
// showSuccess('Data synced successfully!') for every one of them:
//
//   throttled  the 2-minute throttle resolved WITHOUT RUNNING A SYNC AT ALL, so
//              tapping Data & Sync twice inside two minutes was an instant
//              green lie — the cheapest path to reproduce, needing no failure
//   failed     executeSync deliberately does not rethrow network/timeout errors
//              (they retry on their own), so the promise resolved on a push
//              that moved nothing
//   partial    the run advanced the cursor but the free-tier goal cap REFUSED
//              rows, and the cap notice was then overwritten with null by the
//              success path a few hundred lines later
//   no-user    nothing to sync
//
// This was filed as "sync reports success when the push silently failed" and
// deferred as surgery on pushChanges — an ~800-line callback in a 2,600-line
// hook. It is not there. pushChanges rethrows correctly and executeSync rethrows
// after the pull (both pinned by syncPullSurvivesPushFailure.test.ts). The lie
// was entirely in what the resolve path COULDN'T SAY and what the screen assumed.
//
// SOURCE-LEVEL, over COMMENT-STRIPPED source. The round trip needs a live
// Supabase, so these pin structure — but this repo has three times shipped a
// guard that matched its own explanatory comment and therefore measured nothing
// (aiGenerationRateLimit searching a string that also appeared in the comment
// above the gate; the apostrophe regex; commitmentEngine's vacuous asserts). The
// code below is heavily commented, so stripping is not optional here.
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const SYNC = read('hooks/useSync.ts');
const SETTINGS = read('app/(tabs)/settings.tsx');

/** The body of handleSync, so an assertion cannot pass on some other handler. */
function handleSyncBody(): string {
  const start = SETTINGS.indexOf('const handleSync');
  expect(start).toBeGreaterThan(-1);
  const end = SETTINGS.indexOf('const handleSignOut');
  expect(end).toBeGreaterThan(start);
  return SETTINGS.slice(start, end);
}

describe('executeSync — every resolve path says what it actually did', () => {
  it('reports the throttle as skipped rather than resolving bare', () => {
    expect(SYNC).toMatch(/settle\.resolve\(\{\s*status:\s*'skipped',\s*reason:\s*'throttled'\s*\}\)/);
  });

  it('reports a swallowed network failure as failed', () => {
    // executeSync intentionally does NOT rethrow these. That is correct — they
    // retry — but resolving is not succeeding, and the caller has to be able to
    // tell the difference.
    expect(SYNC).toMatch(/return \{ status: 'failed', message: errorMessage \};/);
  });

  it('reports a signed-out run as skipped', () => {
    expect(SYNC).toMatch(/return \{ status: 'skipped', reason: 'no-user' \};/);
  });

  it('never resolves the settle with no argument at all', () => {
    // The original bug in one line: `settle.resolve()` carries no information,
    // so every caller had to assume the best.
    expect(SYNC).not.toMatch(/settle\.resolve\(\s*\)/);
  });

  it('carries a cap notice into the final state instead of nulling it', () => {
    // The success path used to end in a flat `error: null`, wiping the free-tier
    // goal message its own run had just set during the push. The notice
    // survived only as long as the render that happened to land between the two
    // setSyncState calls.
    expect(SYNC).toMatch(/const runNotice = runNoticeRef\.current;/);
    expect(SYNC).toMatch(/error: runNotice,/);

    const successState = SYNC.slice(SYNC.indexOf('const runNotice = runNoticeRef.current;'));
    expect(successState.slice(0, 400)).not.toMatch(/error: null/);
  });
});

describe('handleSync — only a completed run is announced', () => {
  it('bypasses the throttle, because an explicit tap is a request', () => {
    expect(handleSyncBody()).toMatch(/await sync\(\{ bypassThrottle: true \}\)/);
  });

  it('never calls sync() bare, which is what the throttle silently caught', () => {
    expect(handleSyncBody()).not.toMatch(/await sync\(\s*\)/);
  });

  it('gates the success toast on the synced outcome', () => {
    const body = handleSyncBody();
    const guard = body.indexOf("outcome.status === 'synced'");
    const toast = body.indexOf("showSuccess('Data synced successfully!')");

    expect(guard).toBeGreaterThan(-1);
    expect(toast).toBeGreaterThan(-1);
    // The guard must PRECEDE the toast — an unguarded showSuccess after the
    // await is the original bug verbatim.
    expect(toast).toBeGreaterThan(guard);
  });

  it('does not re-announce failures the syncState effect already toasts', () => {
    // syncState.error is surfaced by the effect above handleSync, for background
    // syncs nobody is watching. Saying it again from the tap handler is the
    // other half of the same bug: one tap, two contradictory toasts.
    const body = handleSyncBody();
    const showErrorCalls = body.match(/showError\(/g) ?? [];
    // Exactly one: the catch, as a safety net for a throw that never reached
    // syncState at all.
    expect(showErrorCalls).toHaveLength(1);
    expect(body).toMatch(/catch \(e: any\) \{\s*showError\(/);
  });
});
