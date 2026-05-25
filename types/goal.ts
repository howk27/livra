export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
