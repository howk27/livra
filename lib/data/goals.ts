// lib/data/goals.ts
//
// M9 Phase 1 — READ ONLY. Live goals for the current user.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, GOAL_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
import type { GoalRow } from '@/lib/data/types';

// Goals change rarely (create / edit / complete are deliberate user acts), so a
// few minutes of staleness is invisible and saves refetches on every focus.
const GOALS_STALE_TIME = 5 * 60 * 1000;

/** All of the user's live (not soft-deleted) goals, sorted as the UI orders them.
 * Archive semantics are Phase 3's; here "live" is just `deleted_at is null`. */
export async function fetchGoals(): Promise<GoalRow[]> {
  const { data, error } = await dataClient()
    .from('goals')
    .select(selectList(GOAL_COLUMNS))
    .is('deleted_at', null)
    .order('sort_index', { ascending: true });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as GoalRow[];
}

/** A single goal by id (live only). Returns null when absent. */
export async function fetchGoal(goalId: string): Promise<GoalRow | null> {
  const { data, error } = await dataClient()
    .from('goals')
    .select(selectList(GOAL_COLUMNS))
    .eq('id', goalId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw toDataError(error);
  return (data as unknown as GoalRow) ?? null;
}

export function useGoals() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.goals(userId),
    queryFn: fetchGoals,
    enabled: userId !== '',
    staleTime: GOALS_STALE_TIME,
  });
}

export function useGoal(goalId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.goal(userId, goalId),
    queryFn: () => fetchGoal(goalId),
    enabled: userId !== '' && goalId !== '',
    staleTime: GOALS_STALE_TIME,
  });
}
