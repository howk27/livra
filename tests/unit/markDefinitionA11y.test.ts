import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Repeat-class guard for MarkDefinitionBlock (2026-07-19).
 *
 * `design-decisions.md` Log records that `inkMuted` (#9A9A92) fails AA 4.5:1 on
 * light `linen`/`surface` at small sizes; the project moved that class of text
 * to `inkMid` (#4A4A45). The "What's a mark?" concept reveal reintroduced the
 * failure once (fourth instance) and is pinned here. Also pins the 44pt tap
 * target on the toggle, which RN otherwise sizes from a single text line.
 */

const ROOT = join(__dirname, '../../');
const SRC = readFileSync(join(ROOT, 'components/mark/MarkDefinitionBlock.tsx'), 'utf8');

function styleBlock(src: string, name: string): string {
  const m = src.match(new RegExp(`\\b${name}:\\s*\\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`style block "${name}" not found`);
  return m[1];
}

describe('MarkDefinitionBlock accessibility floors', () => {
  it('the concept reveal is painted with inkMid, not inkMuted (AA on linen)', () => {
    const callSite = SRC.match(/styles\.concept,\s*\{\s*color:\s*c\.(\w+)/);
    expect(callSite).not.toBeNull();
    expect(callSite![1]).not.toBe('inkMuted');
    expect(callSite![1]).toBe('inkMid');
  });

  it("the What's a mark? touchable declares a 44pt minimum target", () => {
    const m = styleBlock(SRC, 'linkTouch').match(/minHeight:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
