// tests/unit/notificationCoherenceGuard.test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

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
    const banned = [/ends at midnight/i, /One more today/i, /Close it out before midnight/i, /starting over tomorrow/i, /You said you'd do this today/i, /See you tomorrow/i];
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      if (banned.some((re) => re.test(src))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
