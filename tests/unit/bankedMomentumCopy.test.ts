import { formatBankedMomentum } from '../../lib/momentumPresenter';

const NO_DASH = /[—–]|(?:^|\s)-(?:\s|$)/;

describe('formatBankedMomentum', () => {
  it('returns null for 0, negative, null, undefined', () => {
    expect(formatBankedMomentum(0)).toBeNull();
    expect(formatBankedMomentum(-3)).toBeNull();
    expect(formatBankedMomentum(null)).toBeNull();
    expect(formatBankedMomentum(undefined)).toBeNull();
  });

  it('singular at 1 day', () => {
    expect(formatBankedMomentum(1)).toBe('Finished with 1 day of momentum');
  });

  it('plural for >1', () => {
    expect(formatBankedMomentum(14)).toBe('Finished with 14 days of momentum');
  });

  it('no dashes in output', () => {
    for (const d of [1, 2, 7, 30, 365]) {
      expect(formatBankedMomentum(d)!).not.toMatch(NO_DASH);
    }
  });
});
