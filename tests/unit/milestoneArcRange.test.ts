import { milestoneArcRange } from '../../lib/goalMilestones';

describe('milestoneArcRange', () => {
  it('sweeps dated milestones from the previous threshold (endowed progress)', () => {
    expect(milestoneArcRange('25')).toEqual({ from: 0, to: 0.25 });
    expect(milestoneArcRange('50')).toEqual({ from: 0.25, to: 0.5 });
    expect(milestoneArcRange('75')).toEqual({ from: 0.5, to: 0.75 });
  });
  it('returns null for dateless milestones (7/30/60 day counts have no % arc)', () => {
    expect(milestoneArcRange('7')).toBeNull();
    expect(milestoneArcRange('30')).toBeNull();
    expect(milestoneArcRange('60')).toBeNull();
    expect(milestoneArcRange('nonsense')).toBeNull();
  });
});
