import {
  goalPlanMeta,
  goalCardContent,
  cadenceLabel,
  suggestedCadenceLabel,
  markPreviewIdentity,
} from '../../lib/creation/creationPreview';
import { FREQUENCIES } from '../../lib/goalMarkSuggestions';

describe('goalPlanMeta — the assembling goal card meta line (QC2-H)', () => {
  it('renders nothing before the first mark is picked (FU-7a: title alone completes the card)', () => {
    expect(goalPlanMeta(0)).toBeNull();
    expect(goalPlanMeta(0, 'steady')).toBeNull();
    expect(goalPlanMeta(-1)).toBeNull();
  });

  it('pluralizes the mark count', () => {
    expect(goalPlanMeta(1)).toBe('Plan: 1 mark');
    expect(goalPlanMeta(2)).toBe('Plan: 2 marks');
  });

  it('appends the chosen cadence using the shipped FREQUENCIES range vocabulary', () => {
    expect(goalPlanMeta(2, 'steady')).toBe(`Plan: 2 marks · ${FREQUENCIES.steady.range}`);
    expect(goalPlanMeta(1, 'light')).toBe(`Plan: 1 mark · ${FREQUENCIES.light.range}`);
  });

  it('separates with the middle dot, never a dash', () => {
    const line = goalPlanMeta(3, 'pushing')!;
    expect(line).toContain(' · ');
  });
});

describe('goalCardContent — the card assembly states, decided once (retry #1)', () => {
  it('title-only state: everything else renders nothing', () => {
    expect(goalCardContent({})).toEqual({ why: null, marks: [], planMeta: null });
  });

  it('trims the why and drops it when blank', () => {
    expect(goalCardContent({ why: '  because it matters  ' }).why).toBe('because it matters');
    expect(goalCardContent({ why: '   ' }).why).toBeNull();
    expect(goalCardContent({ why: '' }).why).toBeNull();
  });

  it('passes marks and planMeta through, normalizing absence', () => {
    const marks = [{ id: 'a' }, { id: 'b' }];
    const full = goalCardContent({ marks, planMeta: 'Plan: 2 marks' });
    expect(full.marks).toBe(marks);
    expect(full.planMeta).toBe('Plan: 2 marks');
    expect(goalCardContent({ planMeta: null }).planMeta).toBeNull();
  });
});

describe('cadenceLabel — the mark-row preview cadence line', () => {
  it('maps the presets', () => {
    expect(cadenceLabel('everyDay', 0)).toBe('Every day');
    expect(cadenceLabel('threePerWeek', 0)).toBe('3x a week');
  });

  it('counts custom days, singular and plural', () => {
    expect(cadenceLabel('custom', 1)).toBe('1 day a week');
    expect(cadenceLabel('custom', 3)).toBe('3 days a week');
  });

  it('reads seven custom days as every day', () => {
    expect(cadenceLabel('custom', 7)).toBe('Every day');
  });

  it('clamps degenerate day counts instead of rendering nonsense', () => {
    expect(cadenceLabel('custom', 0)).toBe('1 day a week');
    expect(cadenceLabel('custom', 12)).toBe('Every day');
  });
});

describe('suggestedCadenceLabel — library pick cadence', () => {
  it('fixed and abstinence marks are every-day by nature', () => {
    expect(suggestedCadenceLabel({ frequencyKind: 'fixed', frequency_recommended: 3 })).toBe('Every day');
    expect(suggestedCadenceLabel({ frequencyKind: 'abstinence', frequency_recommended: 5 })).toBe('Every day');
  });

  it('variable marks carry their recommended frequency', () => {
    expect(suggestedCadenceLabel({ frequencyKind: 'variable', frequency_recommended: 3 })).toBe('3x a week');
    expect(suggestedCadenceLabel({ frequencyKind: 'variable', frequency_recommended: 7 })).toBe('Every day');
  });

  it('falls back to 3x when the recommendation is missing', () => {
    expect(suggestedCadenceLabel({ frequencyKind: 'variable', frequency_recommended: 0 })).toBe('3x a week');
  });
});

describe('markPreviewIdentity — the preview runs the Focus resolution pipeline', () => {
  it('resolves a library emoji to its category and per-mark glyph, like Focus will', () => {
    const identity = markPreviewIdentity('My lifting thing', '🏋️');
    expect(identity.category).toBe('Fitness');
    expect(identity.icon).toBeTruthy();
  });

  it('falls back to custom for an unmatchable mark (category icon carries it)', () => {
    const identity = markPreviewIdentity('zzz', '🦄');
    expect(identity.category).toBe('custom');
    expect(identity.icon).toBeNull();
  });
});
