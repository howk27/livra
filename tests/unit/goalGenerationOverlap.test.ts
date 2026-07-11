import { validateAIGoalPackage } from '../../lib/ai/goalGeneration';

const base = { goalTitle: 'Get fit', timeframeWeeks: 12, confidence: 'high' as const };
const mark = (name: string, icon: string) => ({ name, icon, frequency: 3, why: 'because' });

describe('validateAIGoalPackage overlap collapse', () => {
  it('collapses gym+steps to the first movement mark', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Run', 'gym'), mark('Steps', 'steps'), mark('Sleep', 'sleep')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Run', 'Sleep']);
  });

  it('collapses gratitude+journaling and focus+study', () => {
    const pkg = validateAIGoalPackage({
      ...base,
      marks: [mark('Gratitude', 'gratitude'), mark('Journal', 'journaling'), mark('Study', 'study')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Gratitude', 'Study']);
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
      marks: [mark('Run', 'gym'), mark('Steps', 'steps')],
    });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Run']);
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
