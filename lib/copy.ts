/**
 * All dynamic copy for Livra 2.0.
 * Pure functions — no side effects, no React Native imports.
 * Every string the user sees that changes with context lives here.
 */

// ─── Shared state types ────────────────────────────────────────────────────

export interface HeaderState {
  completedToday: number;
  totalMarks: number;
  streakDays: number;
  now: Date;
  /** Days since any mark was last logged. 0 = logged today, -1 = never. */
  daysSinceLastLog: number;
}

export interface WeekArcState {
  now: Date;
  /** Unique days with any activity in the current Mon–Sun week. */
  weekLoggedDays: number;
  /** True if every day from Monday up to (and including) today has at least one log. */
  isPerfectWeekSoFar: boolean;
}

export interface PostLogState {
  streakDays: number;
  isReturning: boolean;
  isCompleting3of3: boolean;
  isNearMiss: boolean;
  lastShownPostLogMessage?: string;
}

export interface WeekSentimentState {
  weekLoggedDays: number;
  isAfterComeback: boolean;
}

export interface DailyHeader {
  title: string;
  subtitle: string | null;
}

// ─── Home header ───────────────────────────────────────────────────────────

/**
 * Returns the living header statement for the home screen.
 * Conditions are evaluated most-specific first.
 */
export function getDailyHeader(state: HeaderState): DailyHeader {
  const { completedToday, totalMarks, streakDays, now, daysSinceLastLog } = state;
  const hour = now.getHours();
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const allDone = totalMarks > 0 && completedToday >= totalMarks;
  const noneLogged = completedToday === 0;
  const isReturning = daysSinceLastLog >= 3;

  // All marks done — streak milestones evaluated most-specific first
  if (allDone && streakDays >= 30) {
    return { title: 'Thirty days.', subtitle: 'This is rare.' };
  }
  if (allDone && streakDays >= 7) {
    return { title: 'One week.', subtitle: 'Most people stopped by now.' };
  }
  if (allDone) {
    return { title: 'Done.', subtitle: 'Come back tomorrow.' };
  }

  // Returning after 3+ day gap
  if (isReturning && noneLogged) {
    return { title: "You're back.", subtitle: "That's enough for today." };
  }

  // Monday, nothing logged
  if (dow === 1 && noneLogged) {
    return { title: 'New week.', subtitle: 'Three marks. Make one count.' };
  }

  // Sunday after 8 pm, nothing logged
  if (dow === 0 && hour >= 20 && noneLogged) {
    return { title: "Don't let Sunday slip.", subtitle: null };
  }

  // Evening, nothing logged, streak 5+ days — brevity = urgency
  if (hour >= 19 && noneLogged && streakDays >= 5) {
    return { title: 'Still tonight.', subtitle: null };
  }

  // One mark away from done
  if (totalMarks > 1 && completedToday === totalMarks - 1) {
    return { title: 'Almost there.', subtitle: null };
  }

  // Exactly one logged
  if (completedToday === 1) {
    return { title: 'One down.', subtitle: null };
  }

  // Morning, nothing logged
  if (hour < 12 && noneLogged) {
    if (streakDays >= 1) {
      return {
        title: `Day ${streakDays}.`,
        subtitle: 'You showed up yesterday. Do it again.',
      };
    }
    return { title: "Day's wide open.", subtitle: null };
  }

  // Afternoon, nothing logged
  if (hour < 19 && noneLogged) {
    return { title: 'Still time.', subtitle: null };
  }

  // Default fallback
  return {
    title: 'Daily Momentum',
    subtitle: `${completedToday}/${totalMarks} marks today`,
  };
}

// ─── Week arc strip ────────────────────────────────────────────────────────

/**
 * Single-line week context shown below the header.
 * Override conditions are checked before day-of-week defaults.
 */
export function getWeekArc(state: WeekArcState): string {
  const { now, weekLoggedDays, isPerfectWeekSoFar } = state;
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const hour = now.getHours();
  // Mon=0 … Sun=6, used to know how many days into the week we are
  const dayIndex = dow === 0 ? 6 : dow - 1;

  // Perfect week so far (more than 1 day in — Monday "perfect so far" is just day 1)
  if (isPerfectWeekSoFar && dayIndex >= 1) {
    return "Perfect week so far. Don't stop.";
  }

  // 6/7 logged on Sunday
  if (dow === 0 && weekLoggedDays === 6) {
    return 'One more. Best week ever.';
  }

  // 0 logged by Thursday or later
  if (weekLoggedDays === 0 && dayIndex >= 3) {
    return "The week isn't over.";
  }

  switch (dow) {
    case 1: return 'Week begins.';
    case 2: return 'Day 2 of 7.';
    case 3: return 'Halfway.';
    case 4: return 'Keep it going.';
    case 5: return 'Weekend incoming — the real test.';
    case 6: return 'The weekend test.';
    case 0: return hour >= 18 ? 'Final call.' : 'One day left.';
    default: return 'Keep going.';
  }
}

// ─── Post-log message pool ─────────────────────────────────────────────────

type MessageWeight =
  | 'default'
  | 'streak_any'
  | 'streak_1'
  | 'streak_2plus'
  | 'streak_3plus'
  | 'streak_5plus'
  | 'near_miss'
  | 'returning'
  | 'completing_3of3';

interface Message {
  text: string;
  weight: MessageWeight;
  dynamic?: true;
}

const MESSAGES: Message[] = [
  { text: "Quiet consistency. That's the whole game.", weight: 'default' },
  { text: 'Your future self is watching.', weight: 'default' },
  { text: "Nobody sees this work. That's not the point.", weight: 'default' },
  { text: "Slow and steady isn't a consolation. It's the method.", weight: 'default' },
  { text: "It gets easier to start. Not to stop.", weight: 'default' },
  { text: 'The calendar is filling in.', weight: 'default' },
  { text: 'This is what showing up looks like.', weight: 'default' },
  { text: 'No applause. Just evidence.', weight: 'default' },
  { text: "One more tomorrow.", weight: 'default' },
  { text: "You're further along than you think.", weight: 'default' },
  { text: 'Most people stopped by now.', weight: 'streak_5plus' },
  { text: "This is the version of you that shows up.", weight: 'streak_5plus' },
  { text: 'Day {streak}. Still here.', weight: 'streak_any', dynamic: true },
  { text: 'Same time tomorrow.', weight: 'streak_any' },
  { text: "Show up tomorrow and it becomes a pattern.", weight: 'streak_1' },
  { text: "Every long streak started as a 1.", weight: 'streak_1' },
  { text: 'You did this yesterday too.', weight: 'streak_2plus' },
  { text: 'Two days. Build on it.', weight: 'streak_2plus' },
  { text: 'The streak is growing.', weight: 'streak_3plus' },
  { text: 'Something is shifting.', weight: 'streak_3plus' },
  { text: 'The habit is forming.', weight: 'streak_3plus' },
  { text: "One more day would've been your best week.", weight: 'near_miss' },
  { text: "You came back. That's the hardest part.", weight: 'returning' },
  { text: "It wasn't nothing. It was this.", weight: 'returning' },
  { text: 'This one mattered.', weight: 'completing_3of3' },
  { text: 'Momentum logged.', weight: 'completing_3of3' },
  { text: "Discipline is just doing this again.", weight: 'default' },
  { text: 'The work is invisible. The results aren\'t.', weight: 'default' },
];

/**
 * Picks a contextually weighted post-log message.
 * Never repeats the last shown message.
 */
export function getPostLogMessage(state: PostLogState): string {
  const { streakDays, isReturning, isCompleting3of3, isNearMiss, lastShownPostLogMessage } = state;

  const isEligible = (m: Message): boolean => {
    switch (m.weight) {
      case 'default':         return true;
      case 'streak_any':      return streakDays >= 1;
      case 'streak_1':        return streakDays === 1;
      case 'streak_2plus':    return streakDays >= 2;
      case 'streak_3plus':    return streakDays >= 3;
      case 'streak_5plus':    return streakDays >= 5;
      case 'near_miss':       return isNearMiss;
      case 'returning':       return isReturning;
      case 'completing_3of3': return isCompleting3of3;
    }
  };

  const eligible = MESSAGES.filter(isEligible);
  const pool = eligible.filter((m) => m.text !== lastShownPostLogMessage);
  const source = pool.length > 0 ? pool : eligible;

  const chosen = source[Math.floor(Math.random() * source.length)];

  if (chosen.dynamic) {
    return chosen.text.replace('{streak}', String(streakDays));
  }
  return chosen.text;
}

// ─── Tracking screen — week sentiment header ───────────────────────────────

/**
 * Large bold statement at the top of the tracking screen.
 * Evaluated weekly; honest, not comforting.
 */
export function getWeekSentimentHeader(state: WeekSentimentState): string {
  const { weekLoggedDays, isAfterComeback } = state;

  if (isAfterComeback) return 'You came back. That matters more than you think.';
  if (weekLoggedDays === 7) return 'Perfect week. This is what it looks like.';
  if (weekLoggedDays >= 5) return "Strong week. You're building something real.";
  if (weekLoggedDays >= 3) return 'Half measures. You know you can do more.';
  if (weekLoggedDays >= 1) return "Rough week. They happen. Monday's a clean slate.";
  return 'The week slipped. It does sometimes.';
}
