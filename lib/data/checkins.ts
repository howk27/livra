// lib/data/checkins.ts
//
// M9 Phase 1 — READ ONLY. Check-ins are rows in `mark_events`.
//
// We read the EVENTS, never `marks.total`: the stored total becomes derived in
// Phase 4, and reading it here would bake in the very drift this milestone removes.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, MARK_EVENT_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
import { formatDate } from '@/lib/date';
import { getAppDate } from '@/lib/appDate';
import type { MarkEventRow } from '@/lib/data/types';

// Check-ins change constantly (every tap writes one), so a short stale window keeps
// counts honest while still de-duping bursts of refetches within a few seconds.
const CHECKINS_STALE_TIME = 30 * 1000;

/** Today's local date, computed exactly as the write path stores `occurred_local_date`
 * (`formatDate(getAppDate())` in hooks/useCounters.ts) so reads and writes agree. */
export function todayLocalDate(): string {
  return formatDate(getAppDate());
}

/** All live check-in events for one mark, newest first. */
export async function fetchCheckins(markId: string): Promise<MarkEventRow[]> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .select(selectList(MARK_EVENT_COLUMNS))
    .eq('mark_id', markId)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkEventRow[];
}

/** Every live check-in the user logged on a given local date (default: today). */
export async function fetchTodayCheckins(localDate: string): Promise<MarkEventRow[]> {
  const { data, error } = await dataClient()
    .from('mark_events')
    .select(selectList(MARK_EVENT_COLUMNS))
    .eq('occurred_local_date', localDate)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as MarkEventRow[];
}

export function useCheckins(markId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.checkins(userId, markId),
    queryFn: () => fetchCheckins(markId),
    enabled: userId !== '' && markId !== '',
    staleTime: CHECKINS_STALE_TIME,
  });
}

export function useTodayCheckins() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const localDate = todayLocalDate();
  return useQuery({
    queryKey: queryKeys.todayCheckins(userId, localDate),
    queryFn: () => fetchTodayCheckins(localDate),
    enabled: userId !== '',
    staleTime: CHECKINS_STALE_TIME,
  });
}
