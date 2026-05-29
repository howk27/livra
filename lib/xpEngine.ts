import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';
import {
  loadUserXP,
  upsertUserXP,
  insertXPEvent,
  loadXPEventsForDate,
  loadXPEventDates,
  syncXPToSupabase,
} from './db/xpDb';
import type { UserXP, XPEvent, XPResult } from './db/xpDb';
import { query, queryFirst } from './db';

export type { XPResult };

// ---------------------------------------------------------------------------
// Thresholds & metadata
// ---------------------------------------------------------------------------

export const LEVEL_THRESHOLDS: number[] = [
  0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000,
];

const LEVEL_TITLES: string[] = [
  'Beginner',
  'Committed',
  'Consistent',
  'Focused',
  'Disciplined',
  'Dedicated',
  'Relentless',
  'Unstoppable',
  'Elite',
  'Livra',
];

export const LEVEL_UP_COPY: Record<number, string> = {
  2: "You came back. That's where it starts.",
  3: "Showing up is a skill. You're building it.",
  4: "Most people scatter their energy. You don't.",
  5: "This isn't motivation anymore. It's just you.",
  6: "The work is becoming effortless. That's the point.",
  7: "You finish what others abandon.",
  8: "Goals don't intimidate you anymore.",
  9: "One percent of people get here. You're one of them.",
  10: "You became the thing. This one's yours forever.",
};

// ---------------------------------------------------------------------------
// Pure computation helpers
// ---------------------------------------------------------------------------

export function getLevelForXP(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

export interface LevelProgress {
  currentLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  progressRatio: number;
}

export function getLevelProgress(xp: number): LevelProgress {
  const currentLevel = getLevelForXP(xp);
  const idx = currentLevel - 1;

  if (currentLevel === 10) {
    return {
      currentLevel: 10,
      levelTitle: LEVEL_TITLES[9],
      nextLevelTitle: null,
      xpInCurrentLevel: xp - LEVEL_THRESHOLDS[9],
      xpToNextLevel: 0,
      progressRatio: 1.0,
    };
  }

  const currentThreshold = LEVEL_THRESHOLDS[idx];
  const nextThreshold = LEVEL_THRESHOLDS[idx + 1];
  const xpInCurrentLevel = xp - currentThreshold;
  const rangeSize = nextThreshold - currentThreshold;

  return {
    currentLevel,
    levelTitle: LEVEL_TITLES[idx],
    nextLevelTitle: LEVEL_TITLES[idx + 1],
    xpInCurrentLevel,
    xpToNextLevel: nextThreshold,
    progressRatio: rangeSize > 0 ? xpInCurrentLevel / rangeSize : 0,
  };
}

export function checkLevelUp(previousXP: number, newXP: number): number | null {
  const prevLevel = getLevelForXP(previousXP);
  const newLevel = getLevelForXP(newXP);
  if (newLevel > prevLevel && newLevel <= 10) {
    return newLevel;
  }
  return null;
}

export interface BorderStyle {
  borderWidth: number;
  borderColor: string;
  animated: boolean;
  doubleRing?: boolean;
  shadowElevation?: number;
}

export function getBorderStyle(level: number): BorderStyle {
  if (level <= 2) {
    return { borderWidth: 1, borderColor: '#C26960', animated: false };
  }
  if (level <= 4) {
    return { borderWidth: 2, borderColor: '#C26960', animated: false };
  }
  if (level <= 6) {
    return { borderWidth: 2, borderColor: '#C26960', animated: false, doubleRing: true };
  }
  if (level <= 8) {
    return { borderWidth: 2, borderColor: '#C26960', animated: false, shadowElevation: 6 };
  }
  if (level === 9) {
    return { borderWidth: 3, borderColor: '#C9963A', animated: false };
  }
  return { borderWidth: 3, borderColor: '#C9963A', animated: true };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const DAILY_CAP = 100;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultUserXP(userId: string): UserXP {
  return {
    user_id: userId,
    total_xp: 0,
    current_level: 1,
    cooldown_until: null,
    last_7d_bonus_date: null,
    last_30d_bonus_date: null,
  };
}

async function getDailyXPTotal(userId: string, date: string): Promise<number> {
  const events = await loadXPEventsForDate(userId, date);
  return events.reduce((sum, e) => sum + e.xp_awarded, 0);
}

// ---------------------------------------------------------------------------
// awardMarkXP
// ---------------------------------------------------------------------------

export async function awardMarkXP(
  userId: string,
  markId: string,
  date: string,
): Promise<XPResult> {
  let userXp = (await loadUserXP(userId)) ?? defaultUserXP(userId);
  const previousXP = userXp.total_xp;
  const noAward: XPResult = { xpAwarded: 0, newTotal: previousXP, levelUp: null };

  // Anti-cheat: mark must be ≥ 3 days old
  const mark = await queryFirst<{ created_at: string }>(
    'SELECT created_at FROM lc_counters WHERE id = ? AND deleted_at IS NULL',
    [markId],
  );
  if (!mark) return noAward;
  const markAge = Math.floor(
    (new Date(date + 'T00:00:00Z').getTime() - new Date(mark.created_at).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (markAge < 3) return noAward;

  // Anti-cheat: cooldown active (48h after goal completion)
  if (userXp.cooldown_until) {
    const cooldownEnd = new Date(userXp.cooldown_until).getTime();
    if (Date.now() < cooldownEnd) return noAward;
  }

  // Anti-cheat: already awarded this mark today?
  const todayEvents = await loadXPEventsForDate(userId, date);
  const alreadyAwarded = todayEvents.some((e) => {
    if (e.event_type !== 'mark_logged') return false;
    try {
      const meta = JSON.parse(e.metadata);
      return meta.mark_id === markId;
    } catch {
      return false;
    }
  });
  if (alreadyAwarded) return noAward;

  // Anti-cheat: max 5 unique marks per day
  const marksAwardedToday = new Set<string>();
  for (const e of todayEvents) {
    if (e.event_type !== 'mark_logged') continue;
    try {
      const meta = JSON.parse(e.metadata);
      if (meta.mark_id) marksAwardedToday.add(meta.mark_id);
    } catch {}
  }
  if (marksAwardedToday.size >= 5) return noAward;

  // Daily cap check
  const dailyTotal = todayEvents.reduce((s, e) => s + e.xp_awarded, 0);
  if (dailyTotal >= DAILY_CAP) return noAward;

  const markXP = Math.min(10, DAILY_CAP - dailyTotal);
  let totalAwarded = markXP;

  await insertXPEvent({
    id: uuidv4(),
    user_id: userId,
    event_type: 'mark_logged',
    xp_awarded: markXP,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify({ mark_id: markId, date }),
  });

  const refreshedTodayEvents = await loadXPEventsForDate(userId, date);
  let runningDailyTotal = refreshedTodayEvents.reduce((s, e) => s + e.xp_awarded, 0);

  // Full-day bonus: all active marks logged today?
  const activeMarks = await query<{ id: string }>(
    'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const marksLoggedToday = new Set<string>();
  for (const e of refreshedTodayEvents) {
    if (e.event_type !== 'mark_logged') continue;
    try {
      const meta = JSON.parse(e.metadata);
      if (meta.mark_id) marksLoggedToday.add(meta.mark_id);
    } catch {}
  }
  const allLoggedToday =
    activeMarks.length > 0 && activeMarks.every((m) => marksLoggedToday.has(m.id));

  const fullDayAlreadyAwarded = refreshedTodayEvents.some(
    (e) => e.event_type === 'full_day_bonus',
  );

  if (allLoggedToday && !fullDayAlreadyAwarded && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(25, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    runningDailyTotal += bonusXP;
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'full_day_bonus',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  // 7-day consistency bonus
  const sevenDayDates = await loadXPEventDates(userId, 7);
  const qualifies7d = sevenDayDates.length >= 5;
  const last7dBonusExpired =
    !userXp.last_7d_bonus_date ||
    new Date(date + 'T00:00:00Z').getTime() -
      new Date(userXp.last_7d_bonus_date + 'T00:00:00Z').getTime() >
      7 * 24 * 60 * 60 * 1000;

  if (qualifies7d && last7dBonusExpired && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(50, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    runningDailyTotal += bonusXP;
    userXp = { ...userXp, last_7d_bonus_date: date };
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'consistency_7d',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  // 30-day consistency bonus
  const thirtyDayDates = await loadXPEventDates(userId, 30);
  const qualifies30d = thirtyDayDates.length >= 25;
  const last30dBonusExpired =
    !userXp.last_30d_bonus_date ||
    new Date(date + 'T00:00:00Z').getTime() -
      new Date(userXp.last_30d_bonus_date + 'T00:00:00Z').getTime() >
      30 * 24 * 60 * 60 * 1000;

  if (qualifies30d && last30dBonusExpired && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(200, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    userXp = { ...userXp, last_30d_bonus_date: date };
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'consistency_30d',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  const newTotal = previousXP + totalAwarded;
  const levelUp = checkLevelUp(previousXP, newTotal);
  await upsertUserXP({
    ...userXp,
    total_xp: newTotal,
    current_level: getLevelForXP(newTotal),
  });

  syncXPToSupabase(userId).catch((err) =>
    logger.warn('[XP] syncXPToSupabase fire-and-forget failed:', err),
  );

  return { xpAwarded: totalAwarded, newTotal, levelUp };
}

// ---------------------------------------------------------------------------
// awardGoalXP
// ---------------------------------------------------------------------------

export async function awardGoalXP(userId: string, goalId: string): Promise<XPResult> {
  let userXp = (await loadUserXP(userId)) ?? defaultUserXP(userId);
  const previousXP = userXp.total_xp;
  const noAward: XPResult = { xpAwarded: 0, newTotal: previousXP, levelUp: null };

  // Cooldown check
  if (userXp.cooldown_until) {
    const cooldownEnd = new Date(userXp.cooldown_until).getTime();
    if (Date.now() < cooldownEnd) return noAward;
  }

  // Daily cap check
  const today = todayDateString();
  const dailyTotal = await getDailyXPTotal(userId, today);
  if (dailyTotal >= DAILY_CAP) return noAward;

  const goalXP = Math.min(150, DAILY_CAP - dailyTotal);
  const cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await insertXPEvent({
    id: uuidv4(),
    user_id: userId,
    event_type: 'goal_completed',
    xp_awarded: goalXP,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify({ goal_id: goalId }),
  });

  const newTotal = previousXP + goalXP;
  const levelUp = checkLevelUp(previousXP, newTotal);
  await upsertUserXP({
    ...userXp,
    total_xp: newTotal,
    current_level: getLevelForXP(newTotal),
    cooldown_until: cooldownUntil,
  });

  syncXPToSupabase(userId).catch((err) =>
    logger.warn('[XP] syncXPToSupabase fire-and-forget failed:', err),
  );

  return { xpAwarded: goalXP, newTotal, levelUp };
}
