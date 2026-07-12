import { validateAIGoalPackage } from '../../lib/ai/goalGeneration';

const base = { goalTitle: 'Get fit', timeframeWeeks: 12, confidence: 'high' as const };
const mark = (name: string, icon: string) => ({ name, icon, frequency: 3, why: 'because' });

describe('validateAIGoalPackage overlap collapse', () => {
  it('keeps gym+steps uncollapsed (distinct efforts, spec 2026-07-12)', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Run', 'gym'), mark('Steps', 'steps'), mark('Sleep', 'sleep')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Run', 'Steps', 'Sleep']);
  });

  it('collapses gratitude+journaling to the first reflection mark', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Gratitude', 'gratitude'), mark('Journal', 'journaling'), mark('Sleep', 'sleep')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Gratitude', 'Sleep']);
  });

  it('collapses focus+study to the first deep-work mark', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Deep work', 'focus'), mark('Study', 'study'), mark('Sleep', 'sleep')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Deep work', 'Sleep']);
  });

  it('leaves distinct efforts untouched', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Run', 'gym'), mark('Read', 'reading'), mark('Water', 'water')],
    });
    expect(pkg?.marks).toHaveLength(3);
  });

  it('never collapses a package below 1 mark', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Gratitude', 'gratitude'), mark('Journal', 'journaling')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Gratitude']);
  });

  it('does not collapse marks whose icon was repaired to the fallback', () => {
    // 'focus' is FALLBACK_ICON: a repaired junk icon must not knock out a genuine deep-work mark
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Deep work', 'focus'), mark('Weird', 'not-an-icon')],
    });
    expect(pkg?.marks).toHaveLength(2);
  });
});
