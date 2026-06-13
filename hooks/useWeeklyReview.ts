import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWeekRange, getWeeklyReview, WEEKLY_REVIEW_SEED_USER_KEY } from '../lib/review/weeklyReview';
import { useAppDateStore } from '../state/appDateSlice';
import { currentWeekDates } from '../lib/features';

// NOTE: reviews are recomputed on the fly (not stored snapshots). Changing from trailing-7
// to ISO Mon-Sun means future reviews use the new boundary; old history entries under
// trailing-7 keys remain in storage but are superseded by new ISO-keyed entries (cosmetic).
export const useWeeklyReview = (userId?: string) => {
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');

  // Always target the last completed Mon–Sun week, never the in-progress one.
  // currentWeekDates()[0] is this week's Monday; subtracting 1 day gives last Sunday,
  // which getWeekRange interprets as the end of the last complete week.
  const ref = useMemo(() => {
    const currentMonday = new Date(currentWeekDates()[0] + 'T00:00:00');
    const lastSunday = new Date(currentMonday);
    lastSunday.setDate(currentMonday.getDate() - 1);
    return lastSunday;
  }, [appDateKey]);

  const { weekStart } = useMemo(() => getWeekRange(ref), [ref]);
  const [seedUserId, setSeedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      setSeedUserId(null);
      return;
    }
    AsyncStorage.getItem(WEEKLY_REVIEW_SEED_USER_KEY).then((value) => {
      setSeedUserId(value);
    });
  }, [userId]);

  const effectiveUserId = userId || seedUserId || undefined;

  const query = useQuery({
    queryKey: ['weeklyReview', weekStart, effectiveUserId, appDateKey],
    queryFn: () => getWeeklyReview(ref, effectiveUserId),
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    weekStart,
  };
};
