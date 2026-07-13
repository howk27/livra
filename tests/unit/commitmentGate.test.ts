import { canCreateGoalFromCommitment } from '../../lib/goals/commitmentGate';

describe('canCreateGoalFromCommitment (FU-7a)', () => {
  describe('outside onboarding — title is the only required decision', () => {
    it('allows creating a goal with no marks selected', () => {
      expect(
        canCreateGoalFromCommitment({ isOnboarding: false, selectedMarkCount: 0 }),
      ).toBe(true);
    });

    it('allows creating a goal with marks selected', () => {
      expect(
        canCreateGoalFromCommitment({ isOnboarding: false, selectedMarkCount: 3 }),
      ).toBe(true);
    });
  });

  describe('onboarding — the first goal wants at least one mark for substance', () => {
    it('blocks proceeding with no marks selected', () => {
      expect(
        canCreateGoalFromCommitment({ isOnboarding: true, selectedMarkCount: 0 }),
      ).toBe(false);
    });

    it('allows proceeding once a mark is selected', () => {
      expect(
        canCreateGoalFromCommitment({ isOnboarding: true, selectedMarkCount: 1 }),
      ).toBe(true);
    });
  });
});
