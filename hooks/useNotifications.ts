import { useEffect, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  analyzeCountersForNotifications,
  updateNotifications,
  scheduleSmartNotifications,
  NotificationConfig,
  NotificationAnalysis,
} from '../services/notificationService';

// Configure notification behavior
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
}

interface ReminderConfig {
  counterId: string;
  counterName: string;
  hour: number;
  minute: number;
  weekdays?: boolean[]; // [sun, mon, tue, wed, thu, fri, sat]
}

export const useNotifications = () => {
  const [state, setState] = useState<NotificationState>({
    permissionGranted: false,
    loading: true,
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    setState({
      permissionGranted: existingStatus === 'granted',
      loading: false,
    });
  };

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

  const scheduleReminder = useCallback(
    async (config: ReminderConfig): Promise<string | null> => {
      if (!state.permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) return null;
      }

      try {
        const trigger: Notifications.CalendarTriggerInput = {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: config.hour,
          minute: config.minute,
          repeats: true,
        };

        // Get a random funny phrase for manual reminders
        const reminderPhrases = [
          "Your marks are calling",
          "Don't let progress wait",
          "Time to update your stats",
          "Your counter needs attention",
          "Quick check-in time",
          "Don't forget your wins",
          "Make it count today",
          "Progress won't log itself"
        ];
        const reminderTitles = [
          "Just a friendly reminder",
          "Don't let today slip",
          "Time for a quick update",
          "Your progress is waiting",
          "Check-in reminder",
          "Don't skip today",
          "Quick update needed",
          "Your marks miss you"
        ];
        const randomTitle = reminderTitles[Math.floor(Math.random() * reminderTitles.length)];
        const randomPhrase = reminderPhrases[Math.floor(Math.random() * reminderPhrases.length)];

        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: randomTitle,
            body: `${randomPhrase} - Update "${config.counterName}"`,
            data: { counterId: config.counterId },
          },
          trigger,
        });

        return identifier;
      } catch (error) {
        console.error('Error scheduling notification:', error);
        return null;
      }
    },
    [state.permissionGranted, requestPermissions]
  );

  const cancelReminder = useCallback(async (identifier: string) => {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }, []);

  const cancelAllReminders = useCallback(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  const getScheduledReminders = useCallback(async () => {
    return await Notifications.getAllScheduledNotificationsAsync();
  }, []);

  // Smart notification functions
  const analyzeNotifications = useCallback(
    async (userId?: string): Promise<NotificationAnalysis> => {
      return await analyzeCountersForNotifications(userId);
    },
    []
  );

  const updateSmartNotifications = useCallback(
    async (userId?: string, config?: Partial<NotificationConfig>) => {
      if (!state.permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) return;
      }

      await updateNotifications(userId, config);
    },
    [state.permissionGranted, requestPermissions]
  );

  const scheduleSmartNotificationsForAnalysis = useCallback(
    async (
      analysis: NotificationAnalysis,
      config?: Partial<NotificationConfig>
    ) => {
      if (!state.permissionGranted) {
        const granted = await requestPermissions();
        if (!granted) return [];
      }

      const defaultConfig: NotificationConfig = {
        enableDailyReminders: true,
        enableStreakWarnings: true,
        enableInactiveReminders: true,
        dailyReminderHour: 18,
        dailyReminderMinute: 0,
        streakWarningHour: 20,
        streakWarningMinute: 0,
      };

      const finalConfig = { ...defaultConfig, ...config };
      return await scheduleSmartNotifications(analysis, finalConfig);
    },
    [state.permissionGranted, requestPermissions]
  );

  return {
    permissionGranted: state.permissionGranted,
    loading: state.loading,
    requestPermissions,
    scheduleReminder,
    cancelReminder,
    cancelAllReminders,
    getScheduledReminders,
    // Smart notification functions
    analyzeNotifications,
    updateSmartNotifications,
    scheduleSmartNotificationsForAnalysis,
  };
};

