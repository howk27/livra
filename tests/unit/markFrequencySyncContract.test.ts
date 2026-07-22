// Contract: a mark column that exists in BOTH the migration and the Mark type
// must travel on every sync leg. Founder device QC 2026-07-22 — the five
// frequency columns (20260612) and dailyTarget lived only on the device, so a
// reinstall returned every mark as a generic daily habit (goals.tsx falls back
// to weekly_target 7) and the only copy of the user's cadence was gone.
//
// Source-level assertions (same shape as markGoalIdSync.test.ts): the real
// round-trip needs a live Supabase, so this pins the four places a column has
// historically been dropped — pull select, push payload, local INSERT, local
// UPDATE. Add a column to the migration + types and this test fails until sync
// carries it.
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const SYNC_SRC = readFileSync(join(ROOT, 'hooks/useSync.ts'), 'utf8');
const TYPES_SRC = readFileSync(join(ROOT, 'types/index.ts'), 'utf8');
const MIGRATION_SRC = readFileSync(
  join(ROOT, 'supabase/migrations/20260612_frequency_fields.sql'),
  'utf8',
);

/** Columns the migration actually adds to public.marks. */
const migrationColumns = Array.from(
  MIGRATION_SRC.matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/gi),
).map((m) => m[1]);

/** The `Mark = { ... }` block, so we only demand fields the client really owns. */
const markTypeBlock = TYPES_SRC.slice(
  TYPES_SRC.indexOf('export type Mark = {'),
  TYPES_SRC.indexOf('export type MarkEvent'),
);

/** Fields present in the migration AND declared on the Mark type. */
const contractColumns = migrationColumns.filter((column) =>
  new RegExp(`^\\s*${column}\\??:`, 'm').test(markTypeBlock),
);

const counterSelect = SYNC_SRC.match(/const counterSelect\s*=\s*\n?\s*'([^']*)'/)?.[1] ?? '';
const selectedColumns = counterSelect.split(',').map((c) => c.trim());

/** The upsert payload literal built in pushChanges. */
const pushPayload = SYNC_SRC.slice(
  SYNC_SRC.indexOf('const countersToPush = allCounters.map('),
  SYNC_SRC.indexOf('// Sort so deleted counters are pushed first'),
);

/** The local INSERT column list and the local UPDATE SET clause in mergeCounter. */
const insertColumns = SYNC_SRC.match(/INSERT INTO lc_counters \(([\s\S]*?)\)\s*VALUES/)?.[1] ?? '';
const updateSetClause =
  SYNC_SRC.match(/UPDATE lc_counters SET\s*\n([\s\S]*?)WHERE id = \?/)?.[1] ?? '';

describe('mark sync column contract', () => {
  it('finds the five frequency columns in the migration', () => {
    expect(migrationColumns.sort()).toEqual(
      [
        'frequency_kind',
        'frequency_max',
        'frequency_min',
        'frequency_recommended',
        'weekly_target',
      ].sort(),
    );
  });

  it('every migration column is also declared on the Mark type', () => {
    expect(contractColumns.sort()).toEqual(migrationColumns.sort());
  });

  it.each(contractColumns)('%s is selected on pull (counterSelect)', (column) => {
    expect(selectedColumns).toContain(column);
  });

  it.each(contractColumns)('%s is included in the mark push payload', (column) => {
    expect(pushPayload).toContain(`${column}:`);
  });

  it.each(contractColumns)('%s is written on the local INSERT into lc_counters', (column) => {
    expect(insertColumns).toContain(column);
  });

  it.each(contractColumns)('%s is written on the local UPDATE of lc_counters', (column) => {
    expect(updateSetClause).toContain(`${column} = ?`);
  });

  // dailyTarget predates the frequency migration (camelCase column, added
  // separately) but had the same defect in reverse: pushed since day one and
  // never present in counterSelect, so the server value was write-only.
  it('dailyTarget round-trips on both legs', () => {
    expect(selectedColumns).toContain('dailyTarget');
    expect(pushPayload).toContain('dailyTarget:');
    expect(insertColumns).toContain('dailyTarget');
    expect(updateSetClause).toContain('dailyTarget = ?');
  });
});

describe('optional mark columns degrade instead of aborting the sync', () => {
  it('declares every optional column in one list', () => {
    const list = SYNC_SRC.match(/const OPTIONAL_MARK_COLUMNS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
    for (const column of [...contractColumns, 'dailyTarget']) {
      expect(list).toContain(`'${column}'`);
    }
  });

  it('retries the push without a column the server rejects (PGRST204)', () => {
    expect(SYNC_SRC).toMatch(/missingOptionalColumnFromError/);
    expect(SYNC_SRC).toMatch(/error\?\.code !== 'PGRST204'/);
  });

  it('falls back to a legacy select when the server lacks a column', () => {
    expect(SYNC_SRC).toMatch(/const counterSelectLegacy\s*=/);
    expect(SYNC_SRC).toMatch(/isUnknownColumnError/);
  });

  it('never lets a NULL remote value wipe a local frequency value on merge', () => {
    expect(SYNC_SRC).toMatch(/const preserveRemote =/);
    for (const column of contractColumns) {
      expect(SYNC_SRC).toContain(`preserveRemote(remoteCounter.${column}`);
    }
  });
});
