import type { TierId, FrequencyId } from '../lib/goalMarkSuggestions';

export type GoalStatus = 'active' | 'completed' | 'expired' | 'paused';

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
  /** Momentum day-count banked at completion (Phase 1.4). Set only on completed goals. */
  banked_momentum_days?: number | null;
  /** Mark IDs linked to this goal. Populated on fetch from goal_mark_links. */
  linked_mark_ids?: string[];
  /** Commitment tier selected at goal creation (e.g. 'building'). */
  tier?: TierId;
  /** Check-in frequency selected at goal creation (e.g. 'steady'). */
  frequency?: FrequencyId;
};

export type GoalMarkLink = {
  id: string;
  goal_id: string;
  mark_id: string;
};
