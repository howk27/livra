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

// Task 5 (spec §2/§3, 2026-07-24): comebackAsk (shrunk ask, lib/comeback.ts
// resolveComebackAsk) and identityLine (earned-identity claim, the identity
// `claim` override in lib/moments/select.ts). Both fields are optional on
// MarkDefinition — only the highest-traffic library marks carry real copy —
// but whatever is present has to clear the same voice bar the rest of the
// notification surfaces are held to (see notificationCoherenceGuard.test.ts).
describe('MARK_LIBRARY comebackAsk / identityLine copy', () => {
  const withComebackAsk = MARK_LIBRARY.filter((m) => m.comebackAsk != null);
  const withIdentityLine = MARK_LIBRARY.filter((m) => m.identityLine != null);
  const entries = [
    ...withComebackAsk.map((m) => ({ addr: `${m.id}.comebackAsk`, text: m.comebackAsk! })),
    ...withIdentityLine.map((m) => ({ addr: `${m.id}.identityLine`, text: m.identityLine! })),
  ];

  it('at least one entry exists for each field (guard against an empty pool)', () => {
    expect(withComebackAsk.length).toBeGreaterThan(0);
    expect(withIdentityLine.length).toBeGreaterThan(0);
  });

  it.each(entries.map((e) => [e.addr, e.text] as const))(
    '%s: <= 60 chars, ends with a period',
    (_addr, text) => {
      expect(text.length).toBeLessThanOrEqual(60);
      expect(text.trim()).toMatch(/\.$/);
    },
  );

  it.each(entries.map((e) => [e.addr, e.text] as const))(
    '%s: no dash-as-separator, no exclamation marks',
    (_addr, text) => {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/ - /);
      expect(text).not.toContain('!');
    },
  );

  it.each(entries.map((e) => [e.addr, e.text] as const))(
    '%s: no slop, sycophancy, or generic habit-app filler',
    (_addr, text) => {
      expect(text).not.toMatch(
        /\b(amazing|awesome|incredible|crushing|killing it|you('| ha)ve got this|great job|keep it up|proud of you|superstar|unstoppable|small wins?)\b/i,
      );
      expect(text).not.toMatch(/\b(habitica|duolingo|fabulous|habitify)\b/i);
    },
  );

  it.each(entries.map((e) => [e.addr, e.text] as const))(
    '%s: no guilt or loss framing, never names the gap',
    (_addr, text) => {
      expect(text).not.toMatch(
        /\b(lose|lost|losing|streaks?|guilt|guilty|fail|failed|failure|behind|wasted|miss|missed|missing|gap|catch up)\b/i,
      );
    },
  );

  it.each(withComebackAsk.map((m) => [`${m.id}.comebackAsk`, m.comebackAsk!] as const))(
    '%s: never opens with "Just" as a minimizer',
    (_addr, text) => {
      expect(text).not.toMatch(/^just /i);
    },
  );

  it('abstinence-kind marks never carry a comebackAsk (a smaller version of abstinence is incoherent)', () => {
    const offenders = MARK_LIBRARY.filter(
      (m) => m.frequencyKind === 'abstinence' && m.comebackAsk != null,
    ).map((m) => m.id);
    expect(offenders).toEqual([]);
  });
});
