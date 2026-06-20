import {
  getMomentumFirstNudgeCopy,
  getMomentumFinalNudgeCopy,
  getMomentumCombinedCopy,
  getMomentumBannerCopy,
} from '../../lib/copy';

const NO_DASH = /[—–]|(?:^|\s)-(?:\s|$)/; // em, en, or hyphen-as-dash

describe('momentum warning copy', () => {
  it('first nudge substitutes the goal title and carries the template', () => {
    const c = getMomentumFirstNudgeCopy('Run a 5k');
    expect(c.text).toContain('Run a 5k');
    expect(c.text).not.toContain('[Goal]');
    expect(c.template).toContain('[Goal]');
  });

  it('combined names both goals', () => {
    const c = getMomentumCombinedCopy('Run a 5k', 'Read daily');
    expect(c.text).toContain('Run a 5k');
    expect(c.text).toContain('Read daily');
  });

  it('banner has no goal placeholder', () => {
    const c = getMomentumBannerCopy();
    expect(c.text).not.toContain('[Goal]');
    expect(c.template).toBe(c.text);
  });

  it('never returns the lastTemplate back-to-back (when pool > 1)', () => {
    const first = getMomentumFinalNudgeCopy('X');
    for (let i = 0; i < 50; i++) {
      const next = getMomentumFinalNudgeCopy('X', first.template);
      expect(next.template).not.toBe(first.template);
    }
  });

  it('no dashes in any rendered line across many draws', () => {
    const draw = () => [
      getMomentumFirstNudgeCopy('Goal').text,
      getMomentumFinalNudgeCopy('Goal').text,
      getMomentumCombinedCopy('A', 'B').text,
      getMomentumBannerCopy().text,
    ];
    for (let i = 0; i < 40; i++) {
      for (const line of draw()) expect(line).not.toMatch(NO_DASH);
    }
  });
});
