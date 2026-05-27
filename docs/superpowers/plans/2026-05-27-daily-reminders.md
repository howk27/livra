# Daily Reminders + Sleep Alarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-mark daily reminder notifications at a user-set time, and a "Set Wake-Up Alarm →" button on Sleep marks that deep-links to the iOS Clock app. Generalizes the existing sleep notification pattern into a reusable `markReminder.ts` module.

**Architecture:** New `lib/notifications/markReminder.ts` handles scheduling, cancelling, and persisting reminder times for any mark using AsyncStorage key `@livra_reminder_time:{markId}`. Existing `sleepNotification.ts` becomes a thin wrapper that delegates to it (no callers change). The mark detail screen (`counter/[id].tsx`) gains a "Daily Reminder" section for all marks and a "Wake-Up Alarm" section for Sleep marks. `countersSlice.ts` cancels the reminder when a mark is deleted.

**Tech Stack:** `expo-notifications` (already installed), `@react-native-async-storage/async-storage`, `@react-native-community/datetimepicker` (v9.1.0, already installed), `react-native` `Linking`, TypeScript strict.

---

## File Map

| Action | Path |
|--------|------|
| Create | `lib/notifications/markReminder.ts` |
| Create | `tests/unit/markReminder.test.ts` |
| Modify | `lib/notifications/sleepNotification.ts` |
| Modify | `state/countersSlice.ts` |
| Modify | `app/counter/[id].tsx` |

---

### Task 1: Write and pass unit tests for markReminder.ts

**Files:**
- Create: `tests/unit/markReminder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/markReminder.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock expo-notifications before importing the module
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

import {
  getMarkReminderTime,
  setMarkReminderTime,
  clearMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
  markReminderTimeKey,
  REMINDER_NOTIF_ID_PREFIX,
} from '../../lib/notifications/markReminder';

const Notifications = require('expo-notifications');

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
});

describe('markReminderTimeKey', () => {
  it('produces a namespaced key', () => {
    expect(markReminderTimeKey('abc')).toBe('@livra_reminder_time:abc');
  });
});

describe('getMarkReminderTime', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getMarkReminderTime('mark1')).toBeNull();
  });

  it('returns the stored time', async () => {
    await AsyncStorage.setItem('@livra_reminder_time:mark1', '08:30');
    expect(await getMarkReminderTime('mark1')).toBe('08:30');
  });
});

describe('setMarkReminderTime', () => {
  it('persists the time string', async () => {
    await setMarkReminderTime('mark1', '09:00');
    expect(await AsyncStorage.getItem('@livra_reminder_time:mark1')).toBe('09:00');
  });
});

describe('clearMarkReminderTime', () => {
  it('removes the stored time', async () => {
    await AsyncStorage.setItem('@livra_reminder_time:mark1', '07:00');
    await clearMarkReminderTime('mark1');
    expect(await AsyncStorage.getItem('@livra_reminder_time:mark1')).toBeNull();
  });
});

describe('scheduleMarkReminder', () => {
  it('cancels any existing notification then schedules a new one', async () => {
    await scheduleMarkReminder('mark1', 'Deep Work', '08:30');

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_NOTIF_ID_PREFIX}mark1`
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: `${REMINDER_NOTIF_ID_PREFIX}mark1`,
        content: expect.objectContaining({
          body: 'Time to check in on Deep Work.',
          data: { screen: 'checkin', markId: 'mark1' },
        }),
        trigger: expect.objectContaining({ hour: 8, minute: 30 }),
      })
    );
  });

  it('parses hour and minute correctly', async () => {
    await scheduleMarkReminder('mark2', 'Sleep', '22:05');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 22, minute: 5 }),
      })
    );
  });
});

describe('cancelMarkReminder', () => {
  it('cancels the scheduled notification', async () => {
    await cancelMarkReminder('mark1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_NOTIF_ID_PREFIX}mark1`
    );
  });

  it('does not throw if notification does not exist', async () => {
    Notifications.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('not found'));
    await expect(cancelMarkReminder('mark1')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/markReminder.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../../lib/notifications/markReminder'`

---

### Task 2: Implement markReminder.ts

**Files:**
- Create: `lib/notifications/markReminder.ts`

- [ ] **Step 1: Create the module**

```typescript
// lib/notifications/markReminder.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const REMINDER_NOTIF_ID_PREFIX = 'livra-reminder-';
const REMINDER_TIME_PREFIX = '@livra_reminder_time:';

export function markReminderTimeKey(markId: string): string {
  return `${REMINDER_TIME_PREFIX}${markId}`;
}

export async function getMarkReminderTime(markId: string): Promise<string | null> {
  return AsyncStorage.getItem(markReminderTimeKey(markId));
}

export async function setMarkReminderTime(markId: string, hhmm: string): Promise<void> {
  await AsyncStorage.setItem(markReminderTimeKey(markId), hhmm);
}

export async function clearMarkReminderTime(markId: string): Promise<void> {
  await AsyncStorage.removeItem(markReminderTimeKey(markId));
}

export async function scheduleMarkReminder(markId: string, markName: string, hhmm: string): Promise<void> {
  await cancelMarkReminder(markId);

  const [hourStr = '8', minStr = '0'] = hhmm.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  await Notifications.scheduleNotificationAsync({
    identifier: `${REMINDER_NOTIF_ID_PREFIX}${markId}`,
    content: {
      title: markName,
      body: `Time to check in on ${markName}.`,
      data: { screen: 'checkin', markId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelMarkReminder(markId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    `${REMINDER_NOTIF_ID_PREFIX}${markId}`
  ).catch(() => {});
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/markReminder.test.ts --no-coverage 2>&1 | tail -15
```

Expected: `Tests: 9 passed`

- [ ] **Step 3: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/notifications/markReminder.ts tests/unit/markReminder.test.ts && git commit -m "feat: add markReminder notification module with unit tests"
```

---

### Task 3: Update sleepNotification.ts to delegate to markReminder

**Files:**
- Modify: `lib/notifications/sleepNotification.ts`

- [ ] **Step 1: Replace the file contents**

Read the current file first (already read — it's at `lib/notifications/sleepNotification.ts`). Replace the entire file with:

```typescript
// lib/notifications/sleepNotification.ts
// Thin wrapper — delegates to the generic markReminder module.
// Existing callers (counter/[id].tsx HealthKit section) remain unchanged.
import {
  getMarkReminderTime,
  setMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
} from './markReminder';

export function sleepNotifTimeKey(markId: string): string {
  return `@livra_sleep_notif_time:${markId}`;
}

export async function getSleepNotifTime(markId: string): Promise<string | null> {
  return getMarkReminderTime(markId);
}

export async function setSleepNotifTime(markId: string, hhmm: string): Promise<void> {
  await setMarkReminderTime(markId, hhmm);
}

export async function scheduleSleepNotification(markId: string, hhmm: string): Promise<void> {
  await scheduleMarkReminder(markId, 'Sleep', hhmm);
}

export async function cancelSleepNotification(markId: string): Promise<void> {
  await cancelMarkReminder(markId);
}
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "sleepNotification\|markReminder" | head -10
```

Expected: No errors.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/notifications/sleepNotification.ts && git commit -m "refactor: sleepNotification delegates to markReminder"
```

---

### Task 4: Cancel reminder in deleteMark flow

**Files:**
- Modify: `state/countersSlice.ts`

- [ ] **Step 1: Add cancelMarkReminder call to deleteMark**

In `state/countersSlice.ts`, find the `deleteMark` method (around line 236). After the two existing cleanup blocks (daily tracking and features), add:

```typescript
    try {
      const { cancelMarkReminder } = await import('../lib/notifications/markReminder');
      await cancelMarkReminder(id);
    } catch (err) {
      logger.error('[MarksSlice] Failed to cancel reminder for deleted mark:', err);
    }
```

The full updated `deleteMark` tail should look like:

```typescript
    try {
      const { useDailyTrackingStore } = await import('./dailyTrackingSlice');
      await useDailyTrackingStore.getState().deleteDailyLogsForMark(id);
    } catch (err) {
      logger.error('[MarksSlice] Failed to clean up daily tracking for deleted mark:', err);
    }
    try {
      const { useFeaturesStore } = await import('./featuresSlice');
      await useFeaturesStore.getState().deleteSkipDataForMark(id);
    } catch (err) {
      logger.error('[MarksSlice] Failed to clean up skip tokens for deleted mark:', err);
    }
    try {
      const { cancelMarkReminder } = await import('../lib/notifications/markReminder');
      await cancelMarkReminder(id);
    } catch (err) {
      logger.error('[MarksSlice] Failed to cancel reminder for deleted mark:', err);
    }
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "countersSlice" | head -10
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add state/countersSlice.ts && git commit -m "feat: cancel mark reminder when mark is deleted"
```

---

### Task 5: Add Daily Reminder section to mark detail screen

**Files:**
- Modify: `app/counter/[id].tsx`

- [ ] **Step 1: Add state and imports at the top of CounterDetailScreen**

After the existing imports, add:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';
import { Linking } from 'react-native';
import {
  getMarkReminderTime,
  setMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
  clearMarkReminderTime,
} from '../../lib/notifications/markReminder';
```

Inside `CounterDetailScreen`, after the existing state declarations, add:

```typescript
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(true);
```

- [ ] **Step 2: Load saved reminder time on mount**

After the existing `useEffect` hooks, add:

```typescript
  // Load saved reminder preference
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const stored = await getMarkReminderTime(id);
      if (cancelled) return;
      if (stored) {
        const [h = '8', m = '0'] = stored.split(':');
        const d = new Date();
        d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
        setReminderTime(d);
        setReminderEnabled(true);
      }
      setReminderLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);
```

- [ ] **Step 3: Add reminder toggle handler**

```typescript
  const handleReminderToggle = useCallback(async (value: boolean) => {
    if (!id || !counter) return;
    setReminderEnabled(value);
    if (value) {
      setShowTimePicker(true);
      const hhmm = `${reminderTime.getHours()}:${String(reminderTime.getMinutes()).padStart(2, '0')}`;
      await setMarkReminderTime(id, hhmm);
      await scheduleMarkReminder(id, counter.name, hhmm);
    } else {
      setShowTimePicker(false);
      await cancelMarkReminder(id);
      await clearMarkReminderTime(id);
    }
  }, [id, counter, reminderTime]);

  const handleReminderTimeChange = useCallback(async (_: any, selected?: Date) => {
    if (!selected || !id || !counter) return;
    setReminderTime(selected);
    const hhmm = `${selected.getHours()}:${String(selected.getMinutes()).padStart(2, '0')}`;
    await setMarkReminderTime(id, hhmm);
    await scheduleMarkReminder(id, counter.name, hhmm);
  }, [id, counter]);
```

- [ ] **Step 4: Add the Daily Reminder UI section to the render**

Find the HealthConnectBanner section in the render. After it (or after the HealthKit section block), add the Daily Reminder section. Look for a `</View>` that closes the HealthKit section, then add:

```tsx
        {/* ── Daily Reminder ─────────────────────────────────────── */}
        {!reminderLoading && (
          <View style={[styles.section, { backgroundColor: themeColors.surface, borderRadius: borderRadius.xl, padding: spacing.lg, marginTop: spacing.lg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="notifications-outline" size={18} color={themeColors.textSecondary} />
                <Text style={{ color: themeColors.text, fontSize: fontSize.base, fontWeight: '600' }}>
                  Daily Reminder
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            {reminderEnabled && (
              <View style={{ marginTop: spacing.md }}>
                <TouchableOpacity
                  onPress={() => setShowTimePicker((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: themeColors.textSecondary, fontSize: fontSize.sm }}>
                    {reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Ionicons name="chevron-forward-outline" size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>

                {showTimePicker && (
                  <DateTimePicker
                    value={reminderTime}
                    mode="time"
                    display="spinner"
                    onChange={handleReminderTimeChange}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Wake-Up Alarm (Sleep marks only) ────────────────────── */}
        {counter?.type === 'sleep' && (
          <View style={[styles.section, { backgroundColor: themeColors.surface, borderRadius: borderRadius.xl, padding: spacing.lg, marginTop: spacing.lg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name="alarm-outline" size={18} color={themeColors.textSecondary} />
              <Text style={{ color: themeColors.text, fontSize: fontSize.base, fontWeight: '600' }}>
                Wake-Up Alarm
              </Text>
            </View>
            <Text style={{ color: themeColors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md }}>
              Set your alarm in the Clock app.
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('clock:')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
            >
              <Text style={{ color: themeColors.primary, fontSize: fontSize.base, fontWeight: '500' }}>
                Open Clock App
              </Text>
              <Ionicons name="arrow-forward-outline" size={16} color={themeColors.primary} />
            </TouchableOpacity>
          </View>
        )}
```

- [ ] **Step 5: Add Switch import to react-native imports**

In the existing `react-native` import at the top of `counter/[id].tsx`, add `Switch` to the destructuring list.

- [ ] **Step 6: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "\[id\].tsx" | head -20
```

Expected: No errors. Fix any that appear (most likely a missing `styles.section` — add it to the StyleSheet if not present: `section: {}`).

- [ ] **Step 7: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/counter/\[id\].tsx && git commit -m "feat: add daily reminder + sleep alarm sections to mark detail screen"
```

---

### Task 6: Final type-check and test run

- [ ] **Step 1: Full type-check across project**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | head -30
```

Expected: Zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -15
```

Expected: All tests pass; 9 new markReminder tests pass.
