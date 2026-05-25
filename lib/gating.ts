export const FREE_GOAL_LIMIT = 3;
export const FREE_MARK_LIMIT = 3;

export function canAddGoal(isPro: boolean, totalGoalCount: number): boolean {
  return isPro || totalGoalCount < FREE_GOAL_LIMIT;
}

export function canAddMark(isPro: boolean, totalMarkCount: number): boolean {
  return isPro || totalMarkCount < FREE_MARK_LIMIT;
}
