export type GoalStatus = 'active' | 'queued' | 'completed' | 'expired' | 'paused';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_index: number;
  status: GoalStatus;
  /** Primary completion signal: goal completes when currentMarkCount >= targetMarkCount */
  target_mark_count?: number | null;
  current_mark_count: number;
  /** Secondary: if deadline passes with status still 'active' → 'expired'. Only marks complete goals. */
  deadline_date?: string | null;
  /** @deprecated Use deadline_date. Kept for backward compat with target_date callers. */
  target_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  milestones_fired?: string[];
  /** Mark IDs linked to this goal. Populated on fetch from goal_mark_links. */
  linked_mark_ids?: string[];
};

export type GoalMarkLink = {
  id: string;
  goal_id: string;
  mark_id: string;
};
