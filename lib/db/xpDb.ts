import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../supabase';
import { logger } from '../utils/logger';
import { formatDate } from '../date';

const USER_XP_KEY = '@livra_db_user_xp';
const XP_EVENTS_KEY = '@livra_db_xp_events';

export interface UserXP {
  user_id: string;
  total_xp: number;
  current_level: number;
  cooldown_until: string | null;   // ISO timestamp or null
  last_7d_bonus_date: string | null;  // YYYY-MM-DD or null
  last_30d_bonus_date: string | null; // YYYY-MM-DD or null
}

export interface XPEvent {
  id: string;
  user_id: string;
  event_type: 'mark_logged' | 'full_day_bonus' | 'goal_completed' | 'consistency_7d' | 'consistency_30d';
  xp_awarded: number;
  created_at: string; // ISO timestamp
  metadata: string;   // JSON string
}

export interface XPResult {
  xpAwarded: number;
  newTotal: number;
  levelUp: number | null;
}

async function readAllUserXP(): Promise<UserXP[]> {
  try {
    const raw = await AsyncStorage.getItem(USER_XP_KEY);
    return raw ? (JSON.parse(raw) as UserXP[]) : [];
  } catch {
    return [];
  }
}

async function writeAllUserXP(rows: UserXP[]): Promise<void> {
  await AsyncStorage.setItem(USER_XP_KEY, JSON.stringify(rows));
}

async function readAllXPEvents(): Promise<XPEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(XP_EVENTS_KEY);
    return raw ? (JSON.parse(raw) as XPEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeAllXPEvents(rows: XPEvent[]): Promise<void> {
  await AsyncStorage.setItem(XP_EVENTS_KEY, JSON.stringify(rows));
}

export async function loadUserXP(userId: string): Promise<UserXP | null> {
  const all = await readAllUserXP();
  return all.find((r) => r.user_id === userId) ?? null;
}

export async function upsertUserXP(data: UserXP): Promise<void> {
  const all = await readAllUserXP();
  const idx = all.findIndex((r) => r.user_id === data.user_id);
  if (idx >= 0) {
    all[idx] = data;
  } else {
    all.push(data);
  }
  await writeAllUserXP(all);
}

export async function insertXPEvent(event: XPEvent): Promise<void> {
  const all = await readAllXPEvents();
  all.push(event);
  await writeAllXPEvents(all);
}

export async function loadXPEventsForDate(userId: string, date: string): Promise<XPEvent[]> {
  // date is YYYY-MM-DD local; convert created_at (UTC ISO) to local date for comparison
  const all = await readAllXPEvents();
  return all.filter(
    (e) => e.user_id === userId && formatDate(e.created_at) === date,
  );
}

export async function loadXPEventDates(userId: string, days: number): Promise<string[]> {
  // Returns distinct YYYY-MM-DD strings (within last `days`) where ≥1 mark_logged event exists
  const all = await readAllXPEvents();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const dateSet = new Set<string>();
  for (const e of all) {
    if (
      e.user_id === userId &&
      e.event_type === 'mark_logged' &&
      formatDate(e.created_at) >= cutoffISO
    ) {
      dateSet.add(formatDate(e.created_at));
    }
  }
  return Array.from(dateSet);
}

export async function syncXPToSupabase(userId: string): Promise<void> {
  try {
    const userXp = await loadUserXP(userId);
    if (!userXp) return;

    const supabase = getSupabaseClient();
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        total_xp: userXp.total_xp,
        current_level: userXp.current_level,
        goal_completion_cooldown_until: userXp.cooldown_until,
        last_7d_bonus_date: userXp.last_7d_bonus_date,
        last_30d_bonus_date: userXp.last_30d_bonus_date,
      })
      .eq('id', userId);

    if (profileErr) {
      logger.warn('[XP] Supabase profile sync failed (non-blocking):', profileErr.message);
      return;
    }

    const all = await readAllXPEvents();
    const eventsForUser = all.filter((e) => e.user_id === userId);
    if (eventsForUser.length === 0) return;

    const { error: eventsErr } = await supabase.from('xp_events').upsert(
      eventsForUser.map((e) => ({
        id: e.id,
        user_id: e.user_id,
        event_type: e.event_type,
        xp_awarded: e.xp_awarded,
        created_at: e.created_at,
        metadata: (() => { try { return JSON.parse(e.metadata); } catch { return {}; } })(),
      })),
      { onConflict: 'id' },
    );

    if (eventsErr) {
      logger.warn('[XP] Supabase xp_events sync failed (non-blocking):', eventsErr.message);
    }
  } catch (err) {
    logger.warn('[XP] syncXPToSupabase error (non-blocking):', err);
  }
}
