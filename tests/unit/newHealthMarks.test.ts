import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
describe('new health marks surface for their goals', () => {
  it('quit smoking -> no-nicotine', () => {
    expect(getMarksForGoal('I want to quit smoking').map(m => m.id)).toContain('no-nicotine');
  });
  it('cut caffeine -> no-caffeine', () => {
    expect(getMarksForGoal('cut down on caffeine').map(m => m.id)).toContain('no-caffeine');
  });
  it('clear my skin -> skincare', () => {
    expect(getMarksForGoal('clear up my skin').map(m => m.id)).toContain('skincare');
  });
});
