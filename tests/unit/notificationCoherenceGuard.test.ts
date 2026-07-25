// tests/unit/notificationCoherenceGuard.test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { MOMENT_CONTENT } from '../../lib/moments/content';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const ROOT = join(__dirname, '..', '..');
const SRC_DIRS = ['app', 'hooks', 'services', 'lib'].map((d) => join(ROOT, d));

describe('notification coherence guards', () => {
  it('no references to the removed daily engine', () => {
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      if (/scheduleContextualDailyNotification|scheduleBehaviorNotifications/.test(readFileSync(f, 'utf8'))) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no banned daily-nag copy strings remain in source', () => {
    const banned = [/ends at midnight/i, /One more today/i, /Close it out before midnight/i, /starting over tomorrow/i, /You said you['']d do this today/i, /See you tomorrow/i];
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      if (banned.some((re) => re.test(src))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

// Task 4 (spec §2/§3, 2026-07-24): the comeback + earned-identity registers,
// plus the new account-first postLog rows, walked against the same
// banned-phrase classes momentContent.test.ts enforces registry-wide, PLUS
// the ≤60 char pill cap — these three pools render in the postLog pill (or,
// for comeback, the same short-form surface) but are not `postLog.`-prefixed
// addresses, so the generic pillEntries filter in momentContent.test.ts does
// not reach them.
describe('notification coherence guards — comeback / identity / account-first voice pools', () => {
  const newPoolEntries: Array<{ address: string; text: string }> = [
    ...MOMENT_CONTENT.comeback.return!.map((text, i) => ({ address: `comeback.return.${i}`, text })),
    ...MOMENT_CONTENT.identity.fact!.map((text, i) => ({ address: `identity.fact.${i}`, text })),
    ...MOMENT_CONTENT.identity.claim!.map((text, i) => ({ address: `identity.claim.${i}`, text })),
    ...MOMENT_CONTENT.postLog.firstEver!.map((text, i) => ({ address: `postLog.firstEver.${i}`, text })),
    ...MOMENT_CONTENT.postLog.firstDayClosed!.map((text, i) => ({ address: `postLog.firstDayClosed.${i}`, text })),
    ...MOMENT_CONTENT.postLog.dayTwoReturn!.map((text, i) => ({ address: `postLog.dayTwoReturn.${i}`, text })),
    ...MOMENT_CONTENT.postLog.weekOne!.map((text, i) => ({ address: `postLog.weekOne.${i}`, text })),
  ];

  it('covers every new pool (guard against a future pool that forgets to opt in)', () => {
    expect(newPoolEntries.length).toBeGreaterThanOrEqual(3 + 3 + 2 + 1 + 1 + 1 + 1);
  });

  it.each(newPoolEntries.map((e) => [e.address, e.text] as const))(
    '%s fits the pill (<= 60 chars)',
    (_address, text) => {
      expect(text.length).toBeLessThanOrEqual(60);
    },
  );

  it.each(newPoolEntries.map((e) => [e.address, e.text] as const))(
    '%s has no em-dash, en-dash, hyphen-as-dash, or apostrophe',
    (_address, text) => {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/ - /);
      expect(text).not.toMatch(/['’]/);
    },
  );

  it.each(newPoolEntries.map((e) => [e.address, e.text] as const))(
    '%s has no exclamation marks',
    (_address, text) => {
      expect(text).not.toContain('!');
    },
  );

  it.each(newPoolEntries.map((e) => [e.address, e.text] as const))(
    '%s has no guilt or loss language',
    (_address, text) => {
      expect(text).not.toMatch(/\b(lose|lost|losing|streak|guilt|guilty|fail|failed|failure|behind|wasted)\b/i);
    },
  );

  it.each(newPoolEntries.map((e) => [e.address, e.text] as const))(
    '%s has no sycophancy or generic habit-app filler',
    (_address, text) => {
      expect(text).not.toMatch(
        /\b(amazing|awesome|incredible|crushing|killing it|you got this|great job|keep it up|proud of you|superstar|unstoppable)\b/i,
      );
      expect(text).not.toMatch(/\b(habitica|streaks|duolingo|fabulous|habitify)\b/i);
    },
  );

  it('the comeback register never counts or names the missed days', () => {
    for (const line of MOMENT_CONTENT.comeback.return!) {
      expect(line).not.toMatch(/\b(days? (missed|gone|behind)|catch up|where (were|have) you)\b/i);
    }
  });
});
