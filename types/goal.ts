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
  /**
   * Tombstone (M6-B). A deleted goal is UPDATEd with a timestamp, never removed:
   * a hard delete cannot propagate, so the next pull would resurrect the goal.
   * Every reader filters `!deleted_at`; the sync pull deliberately does NOT —
   * returning the tombstone is how the deletion travels to the other device.
   */
  deleted_at?: string | null;
};

/**
 * One mark feeding one goal. Sync-carrying columns added in M6-B
 * (20260716_sync_goals_and_goal_mark_links.sql):
 *   * `user_id` is denormalised off the owning goal so the pull uses the same
 *     (user_id, updated_at DESC) cursor as every other table. RLS REQUIRES it —
 *     a link without it is rejected server-side.
 *   * `updated_at` is client-supplied (no moddatetime trigger) and drives
 *     last-write-wins, exactly like marks.
 *   * `deleted_at` tombstones an unlink. `unique(goal_id, mark_id)` survives the
 *     tombstone, so re-linking must UPSERT on that pair, never INSERT.
 */
export type GoalMarkLink = {
  id: string;
  goal_id: string;
  mark_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};
