import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { drainPendingWidgetLogs } from '../lib/widgets/widgetLogQueue';
import { syncWidgetData } from '../lib/widgets/widgetSync';
import { logger } from '../lib/utils/logger';

/**
 * Reconciles logs tapped in the iOS 17+ interactive widget back into the app.
 *
 * The widget's AppIntent writes taps to an App Group queue without opening the
 * app. This hook drains that queue on mount and whenever the app foregrounds,
 * replaying each tap through the app's real increment path so a widget log is
 * indistinguishable from an in-app one, then re-syncs the widget snapshot.
 *
 * Mounted where the counters hook lives (the Focus tab) so it reuses the exact
 * `increment` used everywhere else — no duplicated persistence logic.
 */
export function useWidgetLogSync(
  increment: (markId: string, userId: string, amount?: number) => Promise<void>,
  userId: string | undefined,
) {
  const drainingRef = useRef(false);

  const reconcile = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    if (!userId) return;
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const applied = await drainPendingWidgetLogs((markId) => increment(markId, userId, 1));
      if (applied > 0) {
        logger.log('[WidgetLogSync] Applied pending widget logs', { applied });
        // Reflect the freshly applied logs (ring + next queued mark) in the widget.
        await syncWidgetData();
      }
    } catch (error) {
      logger.error('[WidgetLogSync] Reconcile failed', error);
    } finally {
      drainingRef.current = false;
    }
  }, [increment, userId]);

  useEffect(() => {
    void reconcile();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void reconcile();
    });
    return () => sub.remove();
  }, [reconcile]);
}
