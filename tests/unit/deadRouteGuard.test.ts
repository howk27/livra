import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('no dead /counter/ route references', () => {
  it('app/ contains no navigation to the retired /counter/ routes', () => {
    const appDir = join(__dirname, '..', '..', 'app');
    const offenders: string[] = [];
    for (const file of walk(appDir)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const src = readFileSync(file, 'utf8');
      if (/['"`]\/counter\//.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
