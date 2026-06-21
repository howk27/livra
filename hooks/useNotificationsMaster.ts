import { useState, useEffect, useCallback } from 'react';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { applyNotificationsMaster } from '../services/notificationsMaster';
import { useAuth } from './useAuth';
import { useMarksStore } from '../state/countersSlice';
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
      const marks = useMarksStore.getState().marks as unknown as ReconcileMark[];
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
