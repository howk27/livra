import { useState, useEffect, useCallback } from 'react';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { applyNotificationsMaster } from '../services/notificationsMaster';
import { useAuth } from './useAuth';
// M9 Phase 5A Task 6: the reconcile list reads the query cache — a MarkRow is
// a ReconcileMark (id + name + deleted_at) structurally.
import { queryClient } from '../lib/data/queryClient';
import { queryKeys } from '../lib/data/queryKeys';
import type { MarkRow } from '../lib/data/types';
import type { ReconcileMark } from '../lib/notifications/markReminder';
import { logger } from '../lib/utils/logger';

export function useNotificationsMaster() {
  const [enabled, setEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    getLivraRemindersEnabled().then((v) => {
      if (active) {
        setEnabledState(v);
        setHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setEnabled = useCallback(
    async (v: boolean) => {
      const prior = enabled;
      setEnabledState(v); // optimistic
      const marks: ReconcileMark[] = user?.id
        ? (queryClient.getQueryData<MarkRow[]>(queryKeys.marks(user.id)) ?? [])
        : [];
      try {
        await applyNotificationsMaster(v, user?.id, marks);
      } catch (err) {
        logger.warn('[NotificationsMaster] applyNotificationsMaster failed; reverting toggle', err);
        setEnabledState(prior);
      }
    },
    [enabled, user],
  );

  return { enabled, hydrated, setEnabled };
}
