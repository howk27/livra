// tests/unit/settingsPaceCopy.test.ts
// The Pace toggle silently rewrote weekly targets across every flexible mark
// (founder QC64 side-note 2). This pins the footnote that explains it.
// Comments are stripped before scanning — this repo has shipped guards that
// matched their own comment (CLAUDE.md "Guards must be confirmed to fail").
import * as fs from 'fs';
import * as path from 'path';

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Pace row footnote', () => {
  const src = stripComments(
    fs.readFileSync(path.join(__dirname, '../../app/(tabs)/settings.tsx'), 'utf8'),
  );
  it('explains what Pace changes and what it leaves alone', () => {
    expect(src).toContain('Sets how many days a week your flexible marks ask for.');
    expect(src).toContain('done this week keep their credit');
    expect(src).toContain('daily marks stay daily');
  });
  it('meta-assertion: the stripper still strips', () => {
    expect(stripComments('// gone\nkept')).not.toContain('gone');
  });
});
