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
// Every migration that adds a client-owned column to public.marks. A column
// listed here is held to the same four-leg contract — 20260725 joined because
// maintenance_of had the identical defect: device-only, so a reinstall dropped
// the provenance of every graduated habit.
const MIGRATION_SRC = [
  'supabase/migrations/20260612_frequency_fields.sql',
  'supabase/migrations/20260725_marks_maintenance_of.sql',
  // 20260726 is drift repair, not a new field: 20250211100000 declared
  // "dailyTarget" and production never got it, so the column had to be added
  // live. Listed here because that is what makes it server-backed.
  'supabase/migrations/20260726_marks_daily_target.sql',
]
  .map((file) => readFileSync(join(ROOT, file), 'utf8'))
  .join('\n');

/**
 * Columns the migration actually adds to public.marks. The optional quotes
 * matter: dailyTarget is camelCase, so it MUST be written "dailyTarget" or
 * Postgres folds it to dailytarget and the client's select misses it.
 */
const migrationColumns = Array.from(
  MIGRATION_SRC.matchAll(/ADD COLUMN IF NOT EXISTS\s+"?(\w+)"?/gi),
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

/**
 * The pull select is composed at run time: a base string of columns that have
 * always existed, plus every OPTIONAL_MARK_COLUMNS entry the server has not
 * rejected this run. So the effective select is base + optional list.
 */
const counterSelectBase =
  SYNC_SRC.match(/const counterSelectBase\s*=\s*\n?\s*'([^']*)'/)?.[1] ?? '';
// Comments are stripped first: the block explains maintenance_of in prose that
// contains an apostrophe, and a bare /'([^']+)'/ sweep happily matches across it.
const optionalColumnList = (
  SYNC_SRC.match(/const OPTIONAL_MARK_COLUMNS = \[([\s\S]*?)\] as const;/)?.[1] ?? ''
).replace(/\/\/[^\n]*/g, '');
const optionalColumns = Array.from(optionalColumnList.matchAll(/'([^']+)'/g)).map((m) => m[1]);
const selectedColumns = [
  ...counterSelectBase.split(',').map((c) => c.trim()),
  ...optionalColumns,
].filter(Boolean);

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
  it('finds every client-owned mark column added by migration', () => {
    expect(migrationColumns.sort()).toEqual(
      [
        'frequency_kind',
        'frequency_max',
        'frequency_min',
        'frequency_recommended',
        'weekly_target',
        'maintenance_of',
        'dailyTarget',
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

  // dailyTarget round-trips on all four legs like any other client-owned column.
  // It is called out separately because it is the one that broke: 20250211100000
  // declared it, production never had it, so the pull 400'd every time and the
  // old all-or-nothing fallback dropped the six cadence columns with it. The
  // column was added live 2026-07-26 (20260726_marks_daily_target.sql).
  it('dailyTarget round-trips on both legs', () => {
    expect(selectedColumns).toContain('dailyTarget');
    expect(pushPayload).toContain('dailyTarget:');
    expect(insertColumns).toContain('dailyTarget');
    expect(updateSetClause).toContain('dailyTarget = ?');
  });

  // The guard that stops this recurring: nothing may be selected from public.marks
  // unless it is a base column or added by a migration this test reads.
  it('every pulled column exists server-side (base or migration-added)', () => {
    const allowed = new Set([
      ...counterSelectBase.split(',').map((c) => c.trim()),
      ...migrationColumns,
    ]);
    const unbacked = selectedColumns.filter((column) => !allowed.has(column));
    expect(unbacked).toEqual([]);
  });
});

describe('optional mark columns degrade instead of aborting the sync', () => {
  it('declares every optional column in one list', () => {
    for (const column of contractColumns) {
      expect(optionalColumnList).toContain(`'${column}'`);
    }
  });

  it('retries the push without a column the server rejects (PGRST204)', () => {
    expect(SYNC_SRC).toMatch(/missingOptionalColumnFromError/);
    expect(SYNC_SRC).toMatch(/error\?\.code !== 'PGRST204'/);
  });

  // The pull degrades PER COLUMN, like the push — not to a legacy select that
  // also drops the columns the server has. Losing one column must cost one
  // column. The base select survives only as an unattributable-error floor.
  it('drops only the column the server named, then retries the pull', () => {
    expect(SYNC_SRC).toMatch(/missingOptionalColumnFromSelectError/);
    expect(SYNC_SRC).toMatch(/const unsupportedPullColumns = new Set<OptionalMarkColumn>\(\)/);
    expect(SYNC_SRC).toMatch(/unsupportedPullColumns\.add\(missingColumn\)/);
    // Composed from the survivors, so a dropped column cannot take others with it.
    expect(SYNC_SRC).toMatch(
      /OPTIONAL_MARK_COLUMNS\.filter\(\(column\) => !unsupportedPullColumns\.has\(column\)\)/,
    );
  });

  it('keeps a base-select floor for an unattributable unknown-column error', () => {
    expect(SYNC_SRC).toMatch(/const counterSelectBase\s*=/);
    expect(SYNC_SRC).toMatch(/isUnknownColumnError/);
  });

  it('never lets a NULL remote value wipe a local frequency value on merge', () => {
    expect(SYNC_SRC).toMatch(/const preserveRemote =/);
    // dailyTarget is excluded on purpose: it predates preserveRemote and has its
    // own, stricter guard below — a remote 0 or non-number keeps the local value,
    // where preserveRemote only defends against null/undefined.
    for (const column of contractColumns.filter((c) => c !== 'dailyTarget')) {
      expect(SYNC_SRC).toContain(`preserveRemote(remoteCounter.${column}`);
    }
  });

  it('dailyTarget keeps its own local-wins guard rather than preserveRemote', () => {
    expect(SYNC_SRC).toMatch(/const preservedDaily =/);
    expect(SYNC_SRC).toMatch(/resolveDailyTarget\(existing as Counter\)/);
  });
});
