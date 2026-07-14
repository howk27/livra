import {
  MOMENT_CONTENT,
  WHY_MAX_CHARS,
  fillTemplate,
  pickTemplate,
  truncateWhy,
} from '../../../lib/moments/content';
import type { MomentType } from '../../../lib/moments/types';

// Every string in the registry, flattened, with its address for readable failures.
const allEntries: Array<{ address: string; text: string }> = Object.entries(MOMENT_CONTENT).flatMap(
  ([type, variants]) =>
    Object.entries(variants).flatMap(([variant, templates]) =>
      templates.map((text, i) => ({ address: `${type}.${variant}.${i}`, text })),
    ),
);

describe('registry copy rules (walked, same discipline as copyDashRule)', () => {
  it('has at least one line for every moment type', () => {
    const types: MomentType[] = [
      'firstWeek',
      'celebration',
      'whyResurface',
      'emptyInvitation',
      'postLog',
      'greetingDefault',
    ];
    for (const t of types) {
      const variants = MOMENT_CONTENT[t];
      expect(Object.keys(variants).length).toBeGreaterThan(0);
      for (const pool of Object.values(variants)) {
        expect(pool.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(allEntries.map((e) => [e.address, e.text] as const))(
    '%s has no em-dash, en-dash, or hyphen-as-dash',
    (_address, text) => {
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/ - /);
    },
  );

  it.each(allEntries.map((e) => [e.address, e.text] as const))(
    '%s has no exclamation marks',
    (_address, text) => {
      expect(text).not.toContain('!');
    },
  );

  it.each(allEntries.map((e) => [e.address, e.text] as const))(
    '%s has no guilt or loss language',
    (_address, text) => {
      expect(text).not.toMatch(/\b(lose|lost|losing|streak|guilt|guilty|fail|failed|failure|behind|wasted)\b/i);
    },
  );
});

describe('truncateWhy', () => {
  it('leaves short whys untouched', () => {
    expect(truncateWhy('feel strong')).toBe('feel strong');
  });

  it('truncates to the cap, ellipsis included', () => {
    const long = 'a'.repeat(200);
    const out = truncateWhy(long);
    expect(out.length).toBeLessThanOrEqual(WHY_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(truncateWhy('  why  ')).toBe('why');
  });
});

describe('fillTemplate', () => {
  it('fills all slots', () => {
    const out = fillTemplate('{name}, {runDays} days on {goalTitle}. {remaining} left.', {
      name: 'Dei',
      runDays: 7,
      goalTitle: 'Marathon',
      remaining: 2,
    });
    expect(out).toBe('Dei, 7 days on Marathon. 2 left.');
  });

  it('drops a leading name gracefully and re-capitalizes', () => {
    expect(fillTemplate('{name}, one step is enough.', { name: null })).toBe('One step is enough.');
    expect(fillTemplate('{name}, one step is enough.', {})).toBe('One step is enough.');
  });

  it('truncates the why to 80 chars inside a template', () => {
    const out = fillTemplate("You wrote: '{why}'.", { why: 'b'.repeat(200) });
    const quoted = out.match(/'([^']*)'/)![1]!;
    expect(quoted.length).toBeLessThanOrEqual(WHY_MAX_CHARS);
  });

  it('falls back to a neutral goal title', () => {
    expect(fillTemplate('Day one of {goalTitle}.', {})).toBe('Day one of your goal.');
  });
});

describe('pickTemplate rotation (caller-held anti-repeat)', () => {
  it('returns a stable id addressing the template', () => {
    const picked = pickTemplate('whyResurface', 'direct', null, () => 0)!;
    expect(picked.id).toBe('whyResurface.direct.0');
    expect(picked.template).toBe(MOMENT_CONTENT.whyResurface.direct![0]);
  });

  it('never repeats the last id back-to-back when the pool has more than one entry', () => {
    let last: string | null = null;
    for (let i = 0; i < 50; i++) {
      const picked = pickTemplate('postLog', 'plain', last)!;
      expect(picked.id).not.toBe(last);
      last = picked.id;
    }
  });

  it('repeats when the pool has a single entry (nothing else to say)', () => {
    const a = pickTemplate('whyResurface', 'direct', 'whyResurface.direct.0', () => 0)!;
    expect(a.id).toBe('whyResurface.direct.0');
  });

  it('returns null for an unknown variant', () => {
    expect(pickTemplate('postLog', 'nope', null, () => 0)).toBeNull();
  });
});
