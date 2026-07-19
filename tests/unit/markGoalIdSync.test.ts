// Guard: marks.goal_id MUST travel across every sync leg. It is the durable
// survivor goalsReconcile rebuilds goal_mark_links from after a reinstall — if
// any leg drops it, marks come back with a null goal_id and a reinstalled goal
// shows no marks (founder device QC, delete+reinstall). These are source-level
// assertions (like markColorContract) because the full sync round-trip needs a
// live Supabase; they pin the four places goal_id was historically missing.
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '../../hooks/useSync.ts'), 'utf8');

describe('marks.goal_id is durable across sync (reinstall link-heal source)', () => {
  it('is selected on pull (counterSelect)', () => {
    const select = SRC.match(/const counterSelect\s*=\s*\n?\s*'([^']*)'/);
    expect(select).not.toBeNull();
    expect(select![1]).toContain('goal_id');
  });

  it('is included in the push payload to the marks table', () => {
    // The upsert payload object literal maps goal_id from the local counter.
    expect(SRC).toMatch(/goal_id:\s*\(c as[^)]*\)\.goal_id/);
  });

  it('is written on the local INSERT into lc_counters', () => {
    const insert = SRC.match(/INSERT INTO lc_counters \(([\s\S]*?)\)\s*VALUES/);
    expect(insert).not.toBeNull();
    expect(insert![1]).toContain('goal_id');
  });

  it('is written on the local UPDATE of lc_counters', () => {
    expect(SRC).toMatch(/UPDATE lc_counters SET[\s\S]*?goal_id = \?/);
  });
});
