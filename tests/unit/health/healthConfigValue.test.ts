import {
  parseHealthValue,
  resolveHealthValue,
  withHealthValue,
  describeHealthValue,
  healthValueInputText,
  healthValueLabel,
  healthValuePrompt,
} from '@/lib/health/healthConfigValue';
import { STEP_GOAL_FALLBACK, SLEEP_HOURS_DEFAULT } from '@/lib/health/healthDefaults';
import * as autoSync from '@/lib/health/autoSync';

describe('healthConfigValue — parsing', () => {
  it('accepts a whole step goal', () => {
    expect(parseHealthValue('steps', '9500')).toEqual({ ok: true, value: 9500 });
  });

  it('accepts a half-hour sleep target', () => {
    expect(parseHealthValue('sleep', '6.5')).toEqual({ ok: true, value: 6.5 });
  });

  it('rejects a fractional step goal rather than rounding it', () => {
    const r = parseHealthValue('steps', '8000.5');
    expect(r.ok).toBe(false);
  });

  // parseInt('8000abc') is 8000. The old modal used parseInt, so this input
  // would have been silently accepted as a valid goal.
  it('rejects trailing garbage instead of stopping at the first bad character', () => {
    expect(parseHealthValue('steps', '8000abc').ok).toBe(false);
    expect(parseHealthValue('sleep', '7hours').ok).toBe(false);
  });

  it('rejects empty and whitespace', () => {
    expect(parseHealthValue('steps', '').ok).toBe(false);
    expect(parseHealthValue('sleep', '   ').ok).toBe(false);
  });

  it('rejects zero and negatives on both kinds', () => {
    expect(parseHealthValue('steps', '0').ok).toBe(false);
    expect(parseHealthValue('steps', '-100').ok).toBe(false);
    expect(parseHealthValue('sleep', '0').ok).toBe(false);
    expect(parseHealthValue('sleep', '-3').ok).toBe(false);
  });

  it('rejects a sleep target above 24 hours', () => {
    expect(parseHealthValue('sleep', '25').ok).toBe(false);
    expect(parseHealthValue('sleep', '24')).toEqual({ ok: true, value: 24 });
  });

  it('rounds sleep noise to one decimal', () => {
    expect(parseHealthValue('sleep', '6.5333')).toEqual({ ok: true, value: 6.5 });
  });

  it('carries a message on every rejection', () => {
    for (const [kind, raw] of [['steps', ''], ['steps', '-1'], ['sleep', '99'], ['sleep', 'x']] as const) {
      const r = parseHealthValue(kind, raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });
});

describe('healthConfigValue — resolve and merge', () => {
  it('falls back to the shared defaults when config is null', () => {
    expect(resolveHealthValue('steps', null)).toBe(STEP_GOAL_FALLBACK);
    expect(resolveHealthValue('sleep', null)).toBe(SLEEP_HOURS_DEFAULT);
    expect(resolveHealthValue('sleep', undefined)).toBe(SLEEP_HOURS_DEFAULT);
  });

  it('reads a stored value over the default', () => {
    expect(resolveHealthValue('steps', { stepGoal: 12000 })).toBe(12000);
    expect(resolveHealthValue('sleep', { sleepHours: 6 })).toBe(6);
  });

  // A manual connect writes `config: null` for sleep (mark detail passes null
  // for every non-steps type), so the editor must cope with no object at all.
  it('builds a config from null without throwing', () => {
    expect(withHealthValue('sleep', null, 6)).toEqual({ sleepHours: 6 });
  });

  it('does not drop the other key when editing one', () => {
    const both = { stepGoal: 9000, sleepHours: 8 };
    expect(withHealthValue('sleep', both, 6)).toEqual({ stepGoal: 9000, sleepHours: 6 });
    expect(withHealthValue('steps', both, 11000)).toEqual({ stepGoal: 11000, sleepHours: 8 });
  });

  it('does not mutate the config it was handed', () => {
    const original = { stepGoal: 9000 };
    withHealthValue('steps', original, 11000);
    expect(original).toEqual({ stepGoal: 9000 });
  });
});

describe('healthConfigValue — copy', () => {
  it('groups thousands in the step line', () => {
    expect(describeHealthValue('steps', 8000)).toBe('A day counts at 8,000 steps.');
    expect(describeHealthValue('steps', 12500)).toBe('A day counts at 12,500 steps.');
    expect(describeHealthValue('steps', 900)).toBe('A day counts at 900 steps.');
  });

  it('says hours without a trailing zero, and singularises at one', () => {
    expect(describeHealthValue('sleep', 7)).toBe('A night counts at 7 hours of sleep.');
    expect(describeHealthValue('sleep', 6.5)).toBe('A night counts at 6.5 hours of sleep.');
    expect(describeHealthValue('sleep', 1)).toBe('A night counts at 1 hour of sleep.');
  });

  it('seeds the input with a bare value, not the sentence', () => {
    expect(healthValueInputText('steps', 8000)).toBe('8000');
    expect(healthValueInputText('sleep', 7)).toBe('7');
    expect(healthValueInputText('sleep', 6.5)).toBe('6.5');
  });

  // theme/design-decisions.md: no dash-as-dash in user copy.
  it('uses no dashes in any user-facing string', () => {
    const strings = [
      describeHealthValue('steps', 8000),
      describeHealthValue('sleep', 7),
      healthValueLabel('steps'),
      healthValueLabel('sleep'),
      healthValuePrompt('steps'),
      healthValuePrompt('sleep'),
      ...(['steps', 'sleep'] as const).flatMap((k) => {
        const r = parseHealthValue(k, 'nonsense');
        return r.ok ? [] : [r.error];
      }),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/ - /);
    }
  });
});

describe('healthConfigValue — the defaults are single-sourced', () => {
  // The whole point of healthDefaults.ts. If a copy of these numbers is
  // reintroduced in the sync, the screen starts printing a threshold that is
  // not the one being enforced.
  it('autoSync qualifies against the same numbers the screen displays', async () => {
    let stepsSeen: number | null = null;
    let sleepSeen: number | null = null;
    const readers = {
      workout: async () => new Set<string>(),
      running: async () => new Set<string>(),
      mindful: async () => new Set<string>(),
      steps: async (_dates: string[], stepGoal: number) => {
        stepsSeen = stepGoal;
        return new Set<string>();
      },
      sleep: async (_dates: string[], sleepHours: number) => {
        sleepSeen = sleepHours;
        return new Set<string>();
      },
    };

    // config null = the un-edited case, which is exactly where a duplicated
    // default would diverge from what the row prints.
    await autoSync.qualifiedDays(readers, { type: 'steps', config: null }, ['2026-08-17']);
    await autoSync.qualifiedDays(readers, { type: 'sleep', config: null }, ['2026-08-17']);

    expect(stepsSeen).toBe(resolveHealthValue('steps', null));
    expect(sleepSeen).toBe(resolveHealthValue('sleep', null));
  });

  it('an edited value reaches the sync unchanged', async () => {
    let sleepSeen: number | null = null;
    const readers = {
      workout: async () => new Set<string>(),
      running: async () => new Set<string>(),
      mindful: async () => new Set<string>(),
      steps: async () => new Set<string>(),
      sleep: async (_dates: string[], sleepHours: number) => {
        sleepSeen = sleepHours;
        return new Set<string>();
      },
    };

    const parsed = parseHealthValue('sleep', '6.5');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const config = withHealthValue('sleep', null, parsed.value);

    await autoSync.qualifiedDays(readers, { type: 'sleep', config }, ['2026-08-17']);
    expect(sleepSeen).toBe(6.5);
  });
});
