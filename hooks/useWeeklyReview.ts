import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWeekRange, getWeeklyReview, WEEKLY_REVIEW_SEED_USER_KEY } from '../lib/review/weeklyReview';
import { getAppDate } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';

export const useWeeklyReview = (referenceDate?: Date, userId?: string) => {
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const ref = useMemo(() => referenceDate ?? getAppDate(), [referenceDate, appDateKey]);
  const { weekStart } = useMemo(() => getWeekRange(ref), [ref, appDateKey]);
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
