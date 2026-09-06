import { MARK_HOW_TO, resolveMarkHowTo } from '@/lib/markHowTo';
import { MARK_LIBRARY } from '@/lib/suggestedCounters';

// Coverage guard for the how-to layer (First-100 sprint 2026-09-04): every
// library mark carries a concrete "what doing it looks like" line, and no line
// points at a mark that no longer exists. Copy rules for the strings themselves
// live in copyDashRule.test.ts (lib/markHowTo.ts is a COPY_MODULES entry).

describe('mark how-to coverage', () => {
  it('every library mark has a non-empty how-to line', () => {
    const missing = MARK_LIBRARY.filter(
      (m) => !MARK_HOW_TO[m.id] || MARK_HOW_TO[m.id].trim().length === 0,
    ).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('every how-to key is a real library id', () => {
    const ids = new Set(MARK_LIBRARY.map((m) => m.id));
    const orphans = Object.keys(MARK_HOW_TO).filter((k) => !ids.has(k));
    expect(orphans).toEqual([]);
  });

  it('lines are single lines, not paragraphs', () => {
    for (const [id, line] of Object.entries(MARK_HOW_TO)) {
      expect(`${id}: ${line}`).not.toMatch(/\n/);
      expect(line.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('resolveMarkHowTo', () => {
  it('resolves a library mark by name', () => {
    expect(resolveMarkHowTo({ name: 'Sleep', emoji: '🌙' })).toBe(MARK_HOW_TO.sleep);
  });

  it('resolves case-insensitively, the resolveLibraryMark contract', () => {
    expect(resolveMarkHowTo({ name: 'deep work', emoji: null })).toBe(MARK_HOW_TO['deep-work']);
  });

  it('returns null for a custom mark: silence, never a template', () => {
    expect(resolveMarkHowTo({ name: 'Call grandma', emoji: '📞' })).toBeNull();
  });
});
