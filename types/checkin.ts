export type DailyCheckin = {
  id: string;
  user_id: string;
  goal_id: string;
  date: string;       // YYYY-MM-DD
  showed_up: boolean;
  created_at: string;
};
