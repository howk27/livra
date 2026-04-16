import { useEffect, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { analyzeCountersForNotifications, updateNotifications, NotificationAnalysis } from '../services/notificationService';
import {
  getLivraRemindersEnabled,
  setLivraRemindersEnabled as persistLivraRemindersEnabledPref,
} from '../lib/notifications/livraReminderPrefs';
import { applyLivraRemindersPreference } from '../services/livraLocalNotificationOwner';

// Configure notification behavior (banners for delivered push/local notifications)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface NotificationState {
  permissionGranted: boolean;
  loading: boolean;
  livraRemindersEnabled: boolean;
}

export const useNotifications = () => {
  const [state, setState] = useState<NotificationState>({
    permissionGranted: false,
    loading: true,
    livraRemindersEnabled: true,
  });

  useEffect(() => {
    const init = async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      const enabled = await getLivraRemindersEnabled();
      setState({
        permissionGranted: existingStatus === 'granted',
        loading: false,
        livraRemindersEnabled: enabled,
      });
    };
    void init();
  }, []);

  const checkPermissions = useCallback(async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    setState((prev) => ({
      ...prev,
      permissionGranted: existingStatus === 'granted',
    }));
  }, []);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    const granted = finalStatus === 'granted';
    setState((prev) => ({ ...prev, permissionGranted: granted }));
    return granted;
  }, []);

  const getScheduledReminders = useCallback(async () => {
    return await Notifications.getAllScheduledNotificationsAsync();
  }, []);

  const analyzeNotifications = useCallback(async (userId?: string): Promise<NotificationAnalysis> => {
    return await analyzeCountersForNotifications(userId);
  }, []);

  /** Coalesced reschedule via `livraLocalNotificationOwner` (behavior DATE model only). */
  const updateSmartNotifications = useCallback(
    async (userId?: string) => {
      if (!state.permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) return;
      }
      await updateNotifications(userId);
    },
    [state.permissionGranted, requestPermissions],
  );

  const setLivraRemindersEnabled = useCallback(
    async (userId: string | undefined, enabled: boolean) => {
      await persistLivraRemindersEnabledPref(enabled);
      setState((prev) => ({ ...prev, livraRemindersEnabled: enabled }));
      if (enabled) {
        const granted = await requestPermissions();
        if (!granted) return;
      }
      await applyLivraRemindersPreference(userId, enabled);
    },
    [requestPermissions],
  );

  const refreshLivraRemindersPref = useCallback(async () => {
    const enabled = await getLivraRemindersEnabled();
    setState((prev) => ({ ...prev, livraRemindersEnabled: enabled }));
  }, []);

  return {
    permissionGranted: state.permissionGranted,
    loading: state.loading,
    livraRemindersEnabled: state.livraRemindersEnabled,
    requestPermissions,
    checkPermissions,
    getScheduledReminders,
    analyzeNotifications,
    updateSmartNotifications,
    setLivraRemindersEnabled,
    refreshLivraRemindersPref,
  };
};
