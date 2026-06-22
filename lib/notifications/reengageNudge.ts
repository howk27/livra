export const REENGAGE_TITLE = 'Your goal is still here.';
export const REENGAGE_BODY = "Whenever you're ready, pick up where you left off. There's no rush.";

export const REENGAGE_IDLE_DAYS = 7;
export const REENGAGE_REPEAT_DAYS = 7;

export interface ReengageInput {
  activeGoalCount: number;
  daysIdle: number;
  lastNudgeDate: string | null; // 'yyyy-MM-dd' or null
  atRiskPlanned: boolean;
  today: string; // 'yyyy-MM-dd'
}
export interface ReengageNudge {
  title: string;
  body: string;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function planReengageNudge(input: ReengageInput): ReengageNudge | null {
  if (input.activeGoalCount < 1) return null;
  if (input.atRiskPlanned) return null;
  if (input.daysIdle < REENGAGE_IDLE_DAYS) return null;
  if (input.lastNudgeDate && daysBetween(input.lastNudgeDate, input.today) < REENGAGE_REPEAT_DAYS) {
    return null;
  }
  return { title: REENGAGE_TITLE, body: REENGAGE_BODY };
}
