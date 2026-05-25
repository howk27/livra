import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { DailyCheckin } from '../types/checkin';
import { loadCheckinsForUser, upsertCheckin } from '../lib/db/checkinsDb';
import { getTodayCheckin, hasCheckedInToday, getCheckinStreak } from '../lib/checkinLogic';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CheckinsState {
  checkins: DailyCheckin[];
  loading: boolean;
  loadCheckins: (userId: string) => Promise<void>;
  recordCheckin: (userId: string, goalId: string, showedUp: boolean) => Promise<DailyCheckin>;
  getTodayCheckin: (goalId: string) => DailyCheckin | undefined;
  hasCheckedInToday: (goalId: string) => boolean;
  getCheckinStreak: (goalId: string) => number;
}

export const useCheckinsStore = create<CheckinsState>((set, get) => ({
  checkins: [],
  loading: false,

  loadCheckins: async (userId) => {
    set({ loading: true });
    try {
      const checkins = await loadCheckinsForUser(userId);
      set({ checkins, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  recordCheckin: async (userId, goalId, showedUp) => {
    const today = todayISO();
    const existing = getTodayCheckin(get().checkins, goalId, today);
    const now = new Date().toISOString();

    const checkin: DailyCheckin = existing
      ? { ...existing, showed_up: showedUp }
      : { id: uuidv4(), user_id: userId, goal_id: goalId, date: today, showed_up: showedUp, created_at: now };

    await upsertCheckin(checkin);
    set(s => {
      const without = s.checkins.filter(
        c => !(c.user_id === userId && c.goal_id === goalId && c.date === today),
      );
      return { checkins: [...without, checkin] };
    });

    return checkin;
  },

  getTodayCheckin: (goalId) => getTodayCheckin(get().checkins, goalId, todayISO()),
  hasCheckedInToday: (goalId) => hasCheckedInToday(get().checkins, goalId, todayISO()),
  getCheckinStreak: (goalId) => getCheckinStreak(get().checkins, goalId, todayISO()),
}));
