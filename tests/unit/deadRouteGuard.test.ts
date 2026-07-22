import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function appFiles(): string[] {
  return walk(join(__dirname, '..', '..', 'app')).filter((f) => /\.(ts|tsx)$/.test(f));
}

describe('no dead /counter/ route references', () => {
  it('app/ contains no navigation to the retired /counter/ routes', () => {
    const offenders: string[] = [];
    for (const file of appFiles()) {
      const src = readFileSync(file, 'utf8');
      if (/['"`]\/counter\//.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('no dead /settings/account route references', () => {
  // Retired 2026-07-22: email and password moved into Edit Profile
  // (app/settings/profile.tsx). Nothing may point at the removed screen.
  it('the screen file is gone', () => {
    const offenders = appFiles().filter((f) => /settings[\\/]account\.tsx$/.test(f));
    expect(offenders).toEqual([]);
  });

  it('app/ contains no navigation to /settings/account', () => {
    const offenders: string[] = [];
    for (const file of appFiles()) {
      const src = readFileSync(file, 'utf8');
      if (/['"`]\/settings\/account['"`]/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
