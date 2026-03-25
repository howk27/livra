export type WeeklyReviewDay = {
  date: string; // YYYY-MM-DD
  label: string;
  total: number;
  intensity: 0 | 1 | 2 | 3;
};

export type WeeklyReviewCounterSummary = {
  id: string;
  name: string;
  emoji?: string | null;
  total: number;
};

export type WeeklyReviewDayHighlight = {
  date: string;
  label: string;
  total: number;
};

export type WeeklyReviewStreakHighlight = {
  id: string;
  name: string;
  emoji?: string | null;
  currentStreak: number;
  lastIncrementDate?: string | null;
};

export type WeeklyReview = {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  totalActivity: number;
  daysActive: number;
  bestDay: WeeklyReviewDayHighlight;
  worstDay: WeeklyReviewDayHighlight;
  topCounters: WeeklyReviewCounterSummary[];
  streaksActive: WeeklyReviewStreakHighlight[];
  streaksLost: WeeklyReviewStreakHighlight[];
  insight: string;
  heatmap: WeeklyReviewDay[];
};
