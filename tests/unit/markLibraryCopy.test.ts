import { MARK_LIBRARY } from '../../lib/suggestedCounters';

describe('MARK_LIBRARY descriptions are concrete and clean', () => {
  it.each(MARK_LIBRARY.map((m) => [m.id, m.description] as const))(
    '%s: non-empty, sentence-punctuated, dash-free',
    (_id, description) => {
      expect(description.trim().length).toBeGreaterThan(0);
      expect(description.trim()).toMatch(/[.?!]$/);
      expect(description).not.toMatch(/[—–]/);
      expect(description).not.toMatch(/ - /);
    },
  );

  it('no description uses the vague filler we are removing', () => {
    const banned = [/keep an eye on/i, /the way you intended to eat/i];
    for (const m of MARK_LIBRARY) {
      for (const re of banned) {
        expect(m.description).not.toMatch(re);
      }
    }
  });
});
