import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import { resolveTimeAffinity, isFeasibleNow } from '../../lib/nextStep';

/**
 * Audit of the whole library after the sleep bug (founder: "can we verify no
 * other marks carry the same issue?").
 *
 * Two failure modes are guarded here, both silent by nature:
 *
 * 1. A tagged mark whose affinity cannot be resolved back from a real mark row.
 *    Every mark that carries a timeAffinity must still resolve to it when
 *    looked up the way Focus looks it up — by name, by emoji, and by name alone
 *    with the emoji missing (Mark.emoji is optional).
 *
 * 2. Emoji collisions. Affinity used to resolve on emoji alone, so two library
 *    marks sharing one emoji meant the second could inherit the first's hours.
 *    '🚫' is already shared by no-alcohol and no-sugar; both are anytime today,
 *    which makes it harmless AND easy to break later.
 */
const tagged = MARK_LIBRARY.filter((m) => m.timeAffinity);

describe('time affinity coverage across MARK_LIBRARY', () => {
  it('has tagged marks to check', () => {
    expect(tagged.length).toBeGreaterThan(0);
  });

  it.each(tagged.map((m) => [m.id, m.name, m.emoji, m.timeAffinity] as const))(
    '%s resolves its affinity by name, by emoji, and with no emoji at all',
    (_id, name, emoji, affinity) => {
      expect(resolveTimeAffinity({ name, emoji })).toBe(affinity);
      expect(resolveTimeAffinity({ name })).toBe(affinity);
      expect(resolveTimeAffinity({ name: 'renamed by the user', emoji })).toBe(affinity);
    },
  );

  it('marks sharing an emoji share an affinity, so a collision cannot smuggle one in', () => {
    const byEmoji = new Map<string, Set<string>>();
    for (const m of MARK_LIBRARY) {
      if (!m.emoji) continue;
      const set = byEmoji.get(m.emoji) ?? new Set<string>();
      set.add(m.timeAffinity ?? 'anytime');
      byEmoji.set(m.emoji, set);
    }
    const conflicts = [...byEmoji.entries()]
      .filter(([, affinities]) => affinities.size > 1)
      .map(([emoji, affinities]) => `${emoji}: ${[...affinities].join('/')}`);
    expect(conflicts).toEqual([]);
  });

  it('library names are unique, which is what makes name-first matching safe', () => {
    const names = MARK_LIBRARY.map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the tagged marks land in sensible hours', () => {
  const at = (hour: number) => new Date(2026, 6, 25, hour, 0, 0);

  it('no evening mark is offered at 9am', () => {
    const offered = tagged
      .filter((m) => m.timeAffinity === 'evening')
      .filter((m) => isFeasibleNow(resolveTimeAffinity({ name: m.name, emoji: m.emoji }), at(9)));
    expect(offered.map((m) => m.id)).toEqual([]);
  });

  it('no daytime mark is offered at 11pm', () => {
    const offered = tagged
      .filter((m) => m.timeAffinity === 'daytime')
      .filter((m) => isFeasibleNow(resolveTimeAffinity({ name: m.name, emoji: m.emoji }), at(23)));
    expect(offered.map((m) => m.id)).toEqual([]);
  });
});
