import { dayJustCompleted, momentumDayIncreased } from '../../lib/motionTriggers';

describe('dayJustCompleted', () => {
  it('fires only on the false->true transition', () => {
    expect(dayJustCompleted(false, true)).toBe(true);
    expect(dayJustCompleted(true, true)).toBe(false);
    expect(dayJustCompleted(false, false)).toBe(false);
    expect(dayJustCompleted(true, false)).toBe(false);
  });
});

describe('momentumDayIncreased', () => {
  it('fires when days grow', () => {
    expect(momentumDayIncreased(3, 4)).toBe(true);
  });
  it('does not fire on same, lower, or null values', () => {
    expect(momentumDayIncreased(4, 4)).toBe(false);
    expect(momentumDayIncreased(4, 0)).toBe(false);
    expect(momentumDayIncreased(null, 1)).toBe(false); // first render: no pulse
    expect(momentumDayIncreased(2, null)).toBe(false);
  });
});
