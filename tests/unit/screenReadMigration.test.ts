// M9 Phase 2 — guards for the read swap.
//
// The five migrated screens must READ from `lib/data/` only. They may still WRITE
// through the old stores (that is Phase 3's job to move), so a blunt "this file
// must not mention goalsSlice" scan would be useless — every one of them still
// imports a store for its writes. These guards work the other way round: every
// member a screen touches on a retired store must appear in an ALLOWLIST of write
// and refresh actions. Re-adding a data read (`useGoalsStore(s => s.goals)`,
// `useMarksStore(s => s.marks)`, `s.getEntriesForGoal(...)`) fails the guard by
// construction, because a data field is not in the list.
//
// COMMENTS ARE STRIPPED BEFORE MATCHING. This repo has shipped four guards that
// measured nothing — three matched a comment instead of code and one matched
// across an apostrophe in prose (PROJECT-CONTEXT, "Conventions"). Every screen
// below carries comments that name the very symbols being banned.
//
// Both guards were confirmed to FAIL before being kept:
//   · re-adding `const marks = useMarksStore((s) => s.marks);` to focus.tsx →
//     "focus.tsx reads `marks` from a retired store"
//   · deleting one `// PHASE-2 BRIDGE` marker → the count assertion goes red.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** The five screens Phase 2 migrated. */
const MIGRATED_SCREENS = [
  'app/(tabs)/focus.tsx',
  'app/(tabs)/goals.tsx',
  'app/goal/[id].tsx',
  'app/mark/[id]/index.tsx',
  'app/goal/journal/[id].tsx',
];

/** Stores whose READS Phase 2 replaced. `goalNotesSlice` is here too: Task 5 moved
 *  its reads to `useGoalNotes`, leaving only writes and the cloud-backup hint. */
const RETIRED_STORE_HOOKS = [
  'useMarksStore', // state/countersSlice.ts
  'useGoalsStore', // state/goalsSlice.ts
  'useEventsStore', // state/eventsSlice.ts
  'useCheckinsStore', // state/checkinsSlice.ts
  'useGoalNotesStore', // state/goalNotesSlice.ts
];

/** Members a migrated screen may still touch: writes, and the refresh actions
 *  pull-to-refresh calls to reload the stores the unmigrated parts still read
 *  (momentum). Anything not on this list is treated as a data read. */
const ALLOWED_STORE_MEMBERS = new Set([
  // writes — marks
  'updateMark',
  'convertMarksToMaintenance',
  // writes — goals
  'linkMarkToGoal',
  'unlinkMarkFromGoal',
  'updateGoalTitle',
  'updateGoalTargetDate',
  'completeGoal',
  'deleteGoal',
  'reorderGoals',
  // writes — check-ins
  'deleteEvent',
  // writes — journal
  'addGoalNote',
  'editGoalNote',
  'deleteGoalNote',
  // refresh / derive actions invoked by pull-to-refresh and focus effects.
  // These LOAD the stores; they do not hand the screen a value to render.
  'loadMarks',
  'fetchGoals',
  'evaluateActiveGoalsMomentum',
  // The journal's cloud-BACKUP hint. It reports the outcome of a WRITE (the
  // best-effort Supabase mirror) and has no query-layer equivalent — read errors
  // come from the query itself. It leaves with the writes in Phase 3.
  'goalNotesCloudError',
  'clearGoalNotesCloudError',
]);

/** `useCounters()` is the hook wrapper over countersSlice; its destructured
 *  members follow the same rule. */
const ALLOWED_USE_COUNTERS_MEMBERS = new Set([
  'incrementCounter',
  'decrementCounter',
  'resetCounter',
  'deleteCounter',
  'createCounter',
  'updateMark',
]);

/**
 * Remove `//` line comments and block comments, leaving string literals intact.
 * A naive `s.replace(/\/\/.*$/gm, '')` would also eat the `//` in a URL, and a
 * naive block-comment strip would eat a regex; this walks the source instead.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

/** Every store member a file touches: `useXStore((s) => s.member)`,
 *  `useXStore.getState().member`, and `const { a, b } = useXStore(...)`. */
function storeMembersUsed(code: string): { hook: string; member: string }[] {
  const hooks = RETIRED_STORE_HOOKS.join('|');
  const found: { hook: string; member: string }[] = [];

  // useXStore(s => s.member) / useXStore((s) => s.member(...))
  const selector = new RegExp(`\\b(${hooks})\\s*\\(\\s*\\(?\\s*\\w+\\s*\\)?\\s*=>\\s*\\w+\\.(\\w+)`, 'g');
  // useXStore.getState().member
  const getState = new RegExp(`\\b(${hooks})\\s*\\.\\s*getState\\s*\\(\\s*\\)\\s*\\.\\s*(\\w+)`, 'g');

  for (const re of [selector, getState]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) found.push({ hook: m[1], member: m[2] });
  }

  // const { a, b } = useXStore(); — a whole-store subscription is always a read.
  const destructured = new RegExp(`\\{([^}]*)\\}\\s*=\\s*(${hooks})\\s*\\(`, 'g');
  let d: RegExpExecArray | null;
  while ((d = destructured.exec(code)) !== null) {
    for (const raw of d[1].split(',')) {
      const name = raw.split(':')[0].trim();
      if (name) found.push({ hook: d[2], member: name });
    }
  }

  return found;
}

function useCountersMembersUsed(code: string): string[] {
  const re = /\{([^}]*)\}\s*=\s*useCounters\s*\(/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    for (const raw of m[1].split(',')) {
      const name = raw.split(':')[0].trim();
      if (name) out.push(name);
    }
  }
  return out;
}

describe('M9 Phase 2 — migrated screens do not read the retired stores', () => {
  test.each(MIGRATED_SCREENS)('%s touches only write/refresh members', (relPath) => {
    const code = stripComments(read(relPath));

    const offenders = storeMembersUsed(code)
      .filter(({ member }) => !ALLOWED_STORE_MEMBERS.has(member))
      .map(({ hook, member }) => `${hook} → .${member}`);

    expect(offenders).toEqual([]);
  });

  test.each(MIGRATED_SCREENS)('%s destructures only write actions from useCounters', (relPath) => {
    const code = stripComments(read(relPath));

    const offenders = useCountersMembersUsed(code).filter(
      (member) => !ALLOWED_USE_COUNTERS_MEMBERS.has(member),
    );

    expect(offenders).toEqual([]);
  });

  test('the comment stripper does not eat URLs, and does eat a banned symbol in prose', () => {
    const src = [
      "const url = 'https://livralife.com/a//b';",
      '// useGoalsStore((s) => s.goals) — named in a comment, must not match',
      '/* useMarksStore((s) => s.marks) */',
      'const real = useGoalsStore((s) => s.reorderGoals);',
    ].join('\n');

    const stripped = stripComments(src);

    expect(stripped).toContain('https://livralife.com/a//b');
    expect(storeMembersUsed(stripped).map((f) => f.member)).toEqual(['reorderGoals']);
  });

  test('the guard is not vacuous — a re-added data read is caught', () => {
    const reintroduced = 'const marks = useMarksStore((s) => s.marks);';
    const offenders = storeMembersUsed(stripComments(reintroduced)).filter(
      ({ member }) => !ALLOWED_STORE_MEMBERS.has(member),
    );
    expect(offenders).toEqual([{ hook: 'useMarksStore', member: 'marks' }]);
  });
});

// ── Bridge inventory ─────────────────────────────────────────────────────────
//
// Phase 3 deletes every one of these. The count is PINNED so a bridge added
// without updating this list fails here rather than being discovered missing in
// Phase 3 — the failure message prints the full inventory.

const BRIDGE_FILES = [
  'lib/data/bridge.ts',
  'state/eventsSlice.ts',
  'state/goalNotesSlice.ts',
  'state/goalsSlice.ts',
];

/**
 * file → number of `PHASE-2 BRIDGE` markers.
 *
 * M9 Phase 3 Task 6 took this from 18 to 2. It is a RATCHET: every number here
 * may fall and none may rise, because a new marker means a write went back onto
 * the store path this phase exists to empty.
 *
 * The two that remain are `goalsSlice.linkMarkToGoal` / `unlinkMarkFromGoal`,
 * which still serve four unmigrated creation surfaces (`app/goal/new.tsx`,
 * `app/mark/new.tsx`, `app/onboarding.tsx`, `lib/goals/createFromAIPackage.ts`).
 * They go to zero when those callers move — see `lib/data/bridge.ts`.
 */
const EXPECTED_BRIDGE_MARKERS: Record<string, number> = {
  'lib/data/bridge.ts': 0, // stripped to `bridgeInvalidate` alone
  'state/eventsSlice.ts': 0, // check-ins run through hooks/useCheckin.ts
  'state/goalNotesSlice.ts': 0, // both journal surfaces write through mutations
  'state/goalsSlice.ts': 2, // link + unlink only; the other four are migrated
};

function bridgeMarkerLines(relPath: string): number[] {
  const lines = read(relPath).split('\n');
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (line.includes('PHASE-2 BRIDGE')) hits.push(i + 1);
  });
  return hits;
}

describe('M9 Phase 2 — every bridge is findable and counted', () => {
  test('the inventory matches, and prints itself when it does not', () => {
    const actual: Record<string, number> = {};
    const inventory: string[] = [];

    for (const file of BRIDGE_FILES) {
      const lines = bridgeMarkerLines(file);
      actual[file] = lines.length;
      inventory.push(`${file}: ${lines.join(', ')}`);
    }

    expect({ inventory, counts: actual }).toEqual({
      inventory,
      counts: EXPECTED_BRIDGE_MARKERS,
    });
  });

  test('no bridge marker hides outside the four known files', () => {
    // A bridge in a screen would mean a WRITE moved into the read layer — the one
    // thing Phase 2 forbids.
    const strays = MIGRATED_SCREENS.filter((f) => read(f).includes('PHASE-2 BRIDGE: delete'));
    expect(strays).toEqual([]);
  });

  test('every bridge marker sits on the agreed wording so one grep finds them all', () => {
    for (const file of BRIDGE_FILES) {
      const lines = read(file).split('\n');
      for (const line of lines) {
        if (!line.includes('PHASE-2 BRIDGE')) continue;
        expect(line).toMatch(/PHASE-2 BRIDGE: delete in Phase 3/);
      }
    }
  });
});
