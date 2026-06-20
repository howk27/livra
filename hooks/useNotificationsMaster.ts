import { useState, useEffect, useCallback } from 'react';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { applyNotificationsMaster } from '../services/notificationsMaster';
import { useAuth } from './useAuth';
import { useMarksStore } from '../state/countersSlice';
import type { ReconcileMark } from '../lib/notifications/markReminder';

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
      setEnabledState(v); // optimistic
      const marks = useMarksStore.getState().marks as unknown as ReconcileMark[];
      await applyNotificationsMaster(v, user?.id, marks);
    },
    [user?.id],
  );

  return { enabled, hydrated, setEnabled };
}
