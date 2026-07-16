import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * QC3 wave 2 guard — contrast floor on the journal small-text labels.
 *
 * `design-decisions.md` Log (FU-5, 2026-07-12) records that `inkMuted`
 * (#9A9A92) fails AA 4.5:1 on light `linen`/`surface` at small sizes; the
 * project moved that class of text to `inkMid` (#4A4A45). The journal surfaces
 * reintroduced the failure, so this test pins the fix: each guarded small-text
 * label must resolve to a sub-18px fontSize (i.e. the small-text floor applies)
 * AND must NOT be painted with `c.inkMuted` at its call site.
 *
 * Scoped to the journal/new labels only — it intentionally does not touch the
 * pre-existing "YOUR MARKS" section label, which is out of QC3 wave2 scope.
 */

const ROOT = join(__dirname, '../../');

// Resolve the numeric fontSize scale from the token source (xs:11, sm:12, ...).
function fontSizeScale(): Record<string, number> {
  const tokens = readFileSync(join(ROOT, 'theme/tokens.ts'), 'utf8');
  const block = tokens.match(/export const fontSize\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const scale: Record<string, number> = {};
  for (const m of block.matchAll(/(\w+):\s*(\d+)/g)) scale[m[1]] = Number(m[2]);
  return scale;
}

function styleBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`\\b${name}:\\s*\\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`style block "${name}" not found`);
  return m[1];
}

function fontSizeOf(block: string, scale: Record<string, number>): number {
  const key = block.match(/fontSize:\s*fontSize\.(\w+)/)?.[1];
  if (!key || !(key in scale)) throw new Error(`no resolvable fontSize in block`);
  return scale[key];
}

const SMALL_TEXT_FLOOR = 18;

// (file, styleName) small-text labels that must use inkMid, never inkMuted.
const GUARDED: Array<[string, string]> = [
  ['app/goal/journal/[id].tsx', 'charCount'],
  ['app/goal/journal/[id].tsx', 'cloudHint'],
  ['app/goal/journal/[id].tsx', 'entryTime'],
  ['app/goal/journal/[id].tsx', 'dayHeader'],
  ['app/goal/[id].tsx', 'journalCloudHint'],
  ['app/goal/[id].tsx', 'journalEntryDate'],
];

describe('journal small-text labels clear the contrast floor (QC3 wave2)', () => {
  const scale = fontSizeScale();

  it.each(GUARDED)('%s › %s is small text painted with inkMid, not inkMuted', (rel, name) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');

    // Premise: this label really is small text (the AA 4.5:1 floor applies).
    expect(fontSizeOf(styleBlock(src, name), scale)).toBeLessThan(SMALL_TEXT_FLOOR);

    // The call site pairs this style with an inline color — it must be inkMid.
    const callSite = src.match(new RegExp(`styles\\.${name},\\s*\\{\\s*color:\\s*c\\.(\\w+)`));
    expect(callSite).not.toBeNull();
    expect(callSite![1]).not.toBe('inkMuted');
    expect(callSite![1]).toBe('inkMid');
  });

  it('the JOURNAL section label (goal detail) is inkMid, not inkMuted', () => {
    const src = readFileSync(join(ROOT, 'app/goal/[id].tsx'), 'utf8');
    const journalLine = src
      .split('\n')
      .find((l) => l.includes('styles.sectionLabel') && l.includes('>JOURNAL<'));
    expect(journalLine).toBeDefined();
    expect(journalLine).toContain('c.inkMid');
    expect(journalLine).not.toContain('c.inkMuted');
  });

  it('leaves the out-of-scope "YOUR MARKS" label untouched (still inkMuted)', () => {
    const src = readFileSync(join(ROOT, 'app/goal/[id].tsx'), 'utf8');
    const marksLine = src
      .split('\n')
      .find((l) => l.includes('styles.sectionLabel') && l.includes('>YOUR MARKS<'));
    expect(marksLine).toBeDefined();
    expect(marksLine).toContain('c.inkMuted');
  });
});
