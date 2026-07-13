/**
 * Goal-creation gate (FU-7a).
 *
 * The title is the only required decision to create a goal. Every other choice
 * on the commitment step — marks, tier, frequency — carries a visible smart
 * default, so the create action never blocks on them. Marks are deferred: a
 * user can attach them now or later without the goal being any less valid.
 *
 * Onboarding is the one guided exception: its first goal wants at least one
 * mark selected so the "what does this take?" step has substance.
 */
export function canCreateGoalFromCommitment(opts: {
  isOnboarding: boolean;
  selectedMarkCount: number;
}): boolean {
  return opts.isOnboarding ? opts.selectedMarkCount > 0 : true;
}
