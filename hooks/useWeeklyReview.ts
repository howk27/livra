import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWeekRange, getWeeklyReview, WEEKLY_REVIEW_SEED_USER_KEY } from '../lib/review/weeklyReview';

export const useWeeklyReview = (referenceDate: Date = new Date(), userId?: string) => {
  const { weekStart } = useMemo(() => getWeekRange(referenceDate), [referenceDate]);
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
    queryKey: ['weeklyReview', weekStart, effectiveUserId],
    queryFn: () => getWeeklyReview(referenceDate, effectiveUserId),
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    weekStart,
  };
};
