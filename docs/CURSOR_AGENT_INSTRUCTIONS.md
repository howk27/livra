# Livra+ Feature Implementation — Cursor Agent Instructions

## Overview

Implement 5 new features into the existing Livra React Native / Expo app:
1. **Habit Goals** — per-mark target with animated progress bar
2. **Flexible Schedules** — Mon/Wed/Fri style day picker
3. **Missed Day Forgiveness** — skip tokens that protect streaks
4. **Habit Notes** — daily note attached to each mark entry
5. **Data Backup / Restore** — JSON export via share sheet, import via document picker

The codebase uses:
- Expo Router file-based navigation
- Zustand stores (`useMarksStore`, `useEventsStore`) backed by AsyncStorage (NOT SQLite)
- `Mark` type in `types/index.ts`
- Screens: `app/counter/new.tsx`, `app/counter/[id].tsx`, `app/counter/[id]/edit.tsx`, `app/(tabs)/settings.tsx`
- Components: `components/CounterTile.tsx`
- Layout: `app/_layout.tsx`

**All new fields on `Mark` are optional** — zero existing functionality breaks.

---

## STEP 0 — Install one missing package

Run this in the terminal before touching any code:

```bash
npx expo install expo-document-picker
```

---

## STEP 1 — Create `lib/features.ts`

Create a new file at `src/lib/features.ts` (or `lib/features.ts` — match where `lib/db/index.ts` lives). Paste this exactly:

```typescript
// lib/features.ts
// Pure helper functions for all 5 features. No side effects.

import type { Mark, MarkEvent, DayOfWeek, GoalPeriod, Milestone } from '../types';
import { STREAK_MILESTONES } from '../types';

// ── Date utils ────────────────────────────────────────────

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonthISO(): string {
  return todayISO().slice(0, 7);
}

function startOfWeekISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Feature 1: Goal Progress ──────────────────────────────

export function getPeriodTotal(events: MarkEvent[], markId: string, period: GoalPeriod): number {
  const today = todayISO();
  const from = period === 'day' ? today : period === 'week' ? startOfWeekISO() : startOfMonthISO();
  return events
    .filter(e => e.mark_id === markId && !e.deleted_at && e.event_type === 'increment' && e.occurred_local_date >= from && e.occurred_local_date <= today)
    .reduce((sum, e) => sum + (e.amount ?? 1), 0);
}

export function getGoalProgress(events: MarkEvent[], mark: Mark): number | null {
  if (!mark.goal_value || !mark.goal_period) return null;
  const current = getPeriodTotal(events, mark.id, mark.goal_period as GoalPeriod);
  return Math.min(current / mark.goal_value, 1);
}

export function getGoalLabel(events: MarkEvent[], mark: Mark): string | null {
  if (!mark.goal_value || !mark.goal_period) return null;
  const current = getPeriodTotal(events, mark.id, mark.goal_period as GoalPeriod);
  const periodLabel = mark.goal_period === 'day' ? 'per day' : mark.goal_period === 'week' ? 'per week' : 'per month';
  return `${current} / ${mark.goal_value} ${periodLabel}`;
}

// ── Feature 2: Schedule ───────────────────────────────────

export function parseScheduleDays(mark: Mark): DayOfWeek[] {
  try {
    if (!mark.schedule_days) return [];
    return JSON.parse(mark.schedule_days) as DayOfWeek[];
  } catch { return []; }
}

export function isMarkActiveOnDate(mark: Mark, date: Date = new Date()): boolean {
  const type = mark.schedule_type ?? 'daily';
  if (type === 'daily') return true;
  const days = parseScheduleDays(mark);
  if (days.length === 0) return true;
  return days.includes(date.getDay() as DayOfWeek);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getScheduleLabel(mark: Mark): string {
  const type = mark.schedule_type ?? 'daily';
  if (type === 'daily') return 'Every day';
  if (type === 'weekly') return 'Once a week';
  const days = parseScheduleDays(mark);
  if (days.length === 0) return 'Every day';
  return days.map(d => DAY_NAMES[d]).join(' · ');
}

// ── Feature 3: Skip Tokens ────────────────────────────────

export function getEffectiveSkipTokens(mark: Mark): number {
  const current = currentMonthISO();
  if (mark.skip_tokens_month !== current) return 2;
  return mark.skip_tokens_remaining ?? 2;
}

// ── Streak Milestones ─────────────────────────────────────

export function getMilestoneForStreak(streak: number): Milestone | null {
  const crossed = STREAK_MILESTONES.filter(m => streak >= m.days);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function getNextMilestone(streak: number): Milestone | null {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? null;
}

export function justReachedMilestone(prevStreak: number, currStreak: number): Milestone | null {
  const prev = getMilestoneForStreak(prevStreak);
  const curr = getMilestoneForStreak(currStreak);
  if (curr && curr.days !== prev?.days) return curr;
  return null;
}

// ── Feature 5: Backup ─────────────────────────────────────

export type BackupPayload = {
  version: number;
  exported_at: string;
  marks: any[];
  events: any[];
  streaks: any[];
  notes: any[];
};

export function buildBackupPayload(marks: any[], events: any[], streaks: any[], notes: any[]): BackupPayload {
  return { version: 1, exported_at: new Date().toISOString(), marks, events, streaks, notes };
}

export function validateBackupPayload(raw: unknown): raw is BackupPayload {
  if (!raw || typeof raw !== 'object') return false;
  const p = raw as any;
  return p.version === 1 && typeof p.exported_at === 'string' && Array.isArray(p.marks) && Array.isArray(p.events) && Array.isArray(p.streaks) && Array.isArray(p.notes);
}
```

---

## STEP 2 — Create `lib/backup.ts`

Create a new file at `lib/backup.ts`:

```typescript
// lib/backup.ts  –  Feature 5: Data Backup & Restore
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './utils/logger';
import { buildBackupPayload, validateBackupPayload, type BackupPayload } from './features';

const STORAGE_KEYS = {
  counters: '@livra_db_counters',
  events:   '@livra_db_events',
  streaks:  '@livra_db_streaks',
  notes:    '@livra_notes',
};

export async function exportBackup(): Promise<{ success: boolean; message: string }> {
  try {
    const [countersRaw, eventsRaw, streaksRaw, notesRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.counters),
      AsyncStorage.getItem(STORAGE_KEYS.events),
      AsyncStorage.getItem(STORAGE_KEYS.streaks),
      AsyncStorage.getItem(STORAGE_KEYS.notes),
    ]);

    const marks   = countersRaw ? JSON.parse(countersRaw) : [];
    const events  = eventsRaw   ? JSON.parse(eventsRaw)   : [];
    const streaks = streaksRaw  ? JSON.parse(streaksRaw)  : [];
    const notes   = notesRaw    ? JSON.parse(notesRaw)    : [];

    const payload = buildBackupPayload(marks, events, streaks, notes);
    const json = JSON.stringify(payload, null, 2);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `livra_backup_${date}.json`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) return { success: false, message: 'Sharing is not available on this device.' };

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Save your Livra backup',
      UTI: 'public.json',
    });

    logger.log(`[Backup] Exported ${marks.length} marks, ${events.length} events`);
    return { success: true, message: `Exported ${marks.length} marks and ${events.length} events.` };
  } catch (error) {
    logger.error('[Backup] Export failed:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Export failed.' };
  }
}

export type RestoreResult = {
  success: boolean;
  message: string;
  marksRestored?: number;
  eventsRestored?: number;
};

export async function importBackup(mode: 'merge' | 'replace' = 'merge'): Promise<RestoreResult> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return { success: false, message: 'No file selected.' };
    }

    const fileUri = result.assets[0].uri;
    const raw = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });

    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { return { success: false, message: 'The selected file is not valid JSON.' }; }

    if (!validateBackupPayload(payload)) {
      return { success: false, message: 'This does not appear to be a valid Livra backup file.' };
    }

    const backup = payload as BackupPayload;

    if (mode === 'replace') {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.counters, JSON.stringify(backup.marks)),
        AsyncStorage.setItem(STORAGE_KEYS.events,   JSON.stringify(backup.events)),
        AsyncStorage.setItem(STORAGE_KEYS.streaks,  JSON.stringify(backup.streaks)),
        AsyncStorage.setItem(STORAGE_KEYS.notes,    JSON.stringify(backup.notes)),
      ]);
    } else {
      const [ec, ee, es, en] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.counters).then(r => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(STORAGE_KEYS.events).then(r   => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(STORAGE_KEYS.streaks).then(r  => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(STORAGE_KEYS.notes).then(r    => r ? JSON.parse(r) : []),
      ]);

      const merge = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
        const ids = new Set(existing.map(x => x.id));
        return [...existing, ...incoming.filter(x => !ids.has(x.id))];
      };

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.counters, JSON.stringify(merge(ec, backup.marks))),
        AsyncStorage.setItem(STORAGE_KEYS.events,   JSON.stringify(merge(ee, backup.events))),
        AsyncStorage.setItem(STORAGE_KEYS.streaks,  JSON.stringify(merge(es, backup.streaks))),
        AsyncStorage.setItem(STORAGE_KEYS.notes,    JSON.stringify(merge(en, backup.notes))),
      ]);
    }

    logger.log(`[Backup] Restored ${backup.marks.length} marks, ${backup.events.length} events (${mode})`);
    return {
      success: true,
      message: `Restored ${backup.marks.length} marks and ${backup.events.length} events (${mode}).`,
      marksRestored: backup.marks.length,
      eventsRestored: backup.events.length,
    };
  } catch (error) {
    logger.error('[Backup] Import failed:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Restore failed.' };
  }
}
```

---

## STEP 3 — Create `state/featuresSlice.ts`

Create a new file at `state/featuresSlice.ts`:

```typescript
// state/featuresSlice.ts
// Zustand store for Feature 3 (skip tokens) + Feature 4 (notes)

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { MarkNote, SkipToken } from '../types';
import { currentMonthISO, getEffectiveSkipTokens } from '../lib/features';
import { logger } from '../lib/utils/logger';

const NOTES_KEY = '@livra_notes';
const TOKENS_KEY = '@livra_skip_tokens';

interface FeaturesState {
  notes: MarkNote[];
  skipTokens: SkipToken[];
  loading: boolean;
  loadFeatures: () => Promise<void>;
  upsertNote: (markId: string, userId: string, date: string, text: string) => Promise<MarkNote>;
  deleteNote: (noteId: string) => Promise<void>;
  getNoteForDate: (markId: string, date: string) => MarkNote | null;
  getNotesForMark: (markId: string, limit?: number) => MarkNote[];
  useSkipToken: (markId: string, userId: string, date: string) => Promise<{ success: boolean; message: string }>;
  isDateProtected: (markId: string, date: string) => boolean;
  getTokensForMark: (markId: string) => SkipToken[];
  deleteDataForMark: (markId: string) => Promise<void>;
}

async function persist(key: string, data: unknown) {
  try { await AsyncStorage.setItem(key, JSON.stringify(data)); }
  catch (err) { logger.error('[FeaturesStore] persist error:', err); }
}

async function load<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  notes: [],
  skipTokens: [],
  loading: false,

  loadFeatures: async () => {
    set({ loading: true });
    const [notes, skipTokens] = await Promise.all([
      load<MarkNote>(NOTES_KEY),
      load<SkipToken>(TOKENS_KEY),
    ]);
    set({ notes, skipTokens, loading: false });
    logger.log(`[FeaturesStore] Loaded ${notes.length} notes, ${skipTokens.length} skip tokens`);
  },

  upsertNote: async (markId, userId, date, text) => {
    const now = new Date().toISOString();
    const { notes } = get();
    const idx = notes.findIndex(n => n.mark_id === markId && n.date === date);
    let updated: MarkNote[];
    let note: MarkNote;
    if (idx !== -1) {
      note = { ...notes[idx], text, updated_at: now };
      updated = notes.map((n, i) => (i === idx ? note : n));
    } else {
      note = { id: uuidv4(), mark_id: markId, user_id: userId, date, text, created_at: now, updated_at: now };
      updated = [note, ...notes];
    }
    set({ notes: updated });
    await persist(NOTES_KEY, updated);
    return note;
  },

  deleteNote: async (noteId) => {
    const updated = get().notes.filter(n => n.id !== noteId);
    set({ notes: updated });
    await persist(NOTES_KEY, updated);
  },

  getNoteForDate: (markId, date) =>
    get().notes.find(n => n.mark_id === markId && n.date === date) ?? null,

  getNotesForMark: (markId, limit = 30) =>
    get().notes
      .filter(n => n.mark_id === markId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),

  useSkipToken: async (markId, userId, date) => {
    const { skipTokens } = get();
    if (skipTokens.some(t => t.mark_id === markId && t.protected_date === date)) {
      return { success: false, message: 'This date is already protected.' };
    }
    const { useMarksStore } = await import('./countersSlice');
    const mark = useMarksStore.getState().marks.find(m => m.id === markId);
    if (!mark) return { success: false, message: 'Mark not found.' };
    const available = getEffectiveSkipTokens(mark);
    if (available <= 0) return { success: false, message: 'No skip tokens remaining this month.' };
    const token: SkipToken = {
      id: uuidv4(),
      mark_id: markId,
      user_id: userId,
      protected_date: date,
      created_at: new Date().toISOString(),
    };
    const updatedTokens = [token, ...skipTokens];
    set({ skipTokens: updatedTokens });
    await persist(TOKENS_KEY, updatedTokens);
    await useMarksStore.getState().updateMark(markId, {
      skip_tokens_remaining: available - 1,
      skip_tokens_month: currentMonthISO(),
    } as any);
    logger.log(`[FeaturesStore] Skip token used: ${markId} on ${date}. Remaining: ${available - 1}`);
    return { success: true, message: `Streak protected for ${date}. ${available - 1} token(s) left this month.` };
  },

  isDateProtected: (markId, date) =>
    get().skipTokens.some(t => t.mark_id === markId && t.protected_date === date),

  getTokensForMark: (markId) =>
    get().skipTokens.filter(t => t.mark_id === markId),

  deleteDataForMark: async (markId) => {
    const notes = get().notes.filter(n => n.mark_id !== markId);
    const skipTokens = get().skipTokens.filter(t => t.mark_id !== markId);
    set({ notes, skipTokens });
    await Promise.all([persist(NOTES_KEY, notes), persist(TOKENS_KEY, skipTokens)]);
  },
}));
```

---

## STEP 4 — Create `components/GoalProgressBar.tsx`

Create a new file at `components/GoalProgressBar.tsx`:

```typescript
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { getGoalProgress, getGoalLabel } from '../lib/features';
import type { Mark, MarkEvent } from '../types';

interface GoalProgressBarProps {
  mark: Mark;
  events: MarkEvent[];
  color?: string;
  /** compact = bar only (for tile). full = bar + label text (for detail screen) */
  variant?: 'compact' | 'full';
}

export const GoalProgressBar: React.FC<GoalProgressBarProps> = ({
  mark, events, color, variant = 'compact',
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const progress = getGoalProgress(events, mark);
  const label = getGoalLabel(events, mark);
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (progress === null) return;
    Animated.spring(animWidth, {
      toValue: progress,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }, [progress]);

  if (progress === null) return null;

  const barColor = color || themeColors.primary;
  const isComplete = progress >= 1;

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: themeColors.border }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: isComplete ? '#22c55e' : barColor,
              width: animWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      {variant === 'full' && label && (
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>
          {isComplete ? `✓ Goal reached  ·  ${label}` : label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '500' },
});
```

---

## STEP 5 — Create `components/GoalSection.tsx`

Create a new file at `components/GoalSection.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import type { GoalPeriod } from '../types';

const PERIOD_OPTIONS: { key: GoalPeriod; label: string }[] = [
  { key: 'day', label: 'Per day' },
  { key: 'week', label: 'Per week' },
  { key: 'month', label: 'Per month' },
];

interface GoalSectionProps {
  goalValue: number | null;
  goalPeriod: GoalPeriod;
  unit: string;
  color: string;
  onChange: (value: number | null, period: GoalPeriod) => void;
}

export const GoalSection: React.FC<GoalSectionProps> = ({
  goalValue, goalPeriod, unit, color, onChange,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const [enabled, setEnabled] = useState(goalValue !== null);
  const [rawText, setRawText] = useState(goalValue ? String(goalValue) : '');

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) {
      onChange(null, goalPeriod);
    } else {
      const v = parseInt(rawText, 10);
      onChange(isNaN(v) || v <= 0 ? null : v, goalPeriod);
    }
  };

  const handleValueChange = (text: string) => {
    setRawText(text);
    const v = parseInt(text, 10);
    onChange(isNaN(v) || v <= 0 ? null : v, goalPeriod);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.toggleRow,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        ]}
        onPress={handleToggle}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Set a goal</Text>
          <Text style={[styles.toggleDesc, { color: themeColors.textSecondary }]}>
            Track progress toward a target
          </Text>
        </View>
        <View style={[styles.toggleSwitch, { backgroundColor: enabled ? color : themeColors.border }]}>
          <View style={[styles.toggleThumb, { marginLeft: enabled ? 20 : 2 }]} />
        </View>
      </TouchableOpacity>

      {enabled && (
        <View style={[styles.configBox, { backgroundColor: themeColors.surfaceVariant ?? themeColors.surface }]}>
          <View style={styles.valueRow}>
            <TextInput
              value={rawText}
              onChangeText={handleValueChange}
              keyboardType="numeric"
              placeholder="8"
              placeholderTextColor={themeColors.textSecondary}
              maxLength={4}
              style={[
                styles.valueInput,
                {
                  color: themeColors.text,
                  backgroundColor: themeColors.background,
                  borderColor: themeColors.border,
                },
              ]}
            />
            <Text style={[styles.unitLabel, { color: themeColors.textSecondary }]}>{unit}</Text>
          </View>

          <View style={styles.periodRow}>
            {PERIOD_OPTIONS.map(opt => {
              const active = goalPeriod === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.periodPill,
                    {
                      backgroundColor: active ? color : themeColors.surface,
                      borderColor: active ? color : themeColors.border,
                    },
                  ]}
                  onPress={() => onChange(goalValue, opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.periodText, { color: active ? '#fff' : themeColors.textSecondary }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {goalValue && (
            <Text style={[styles.preview, { color: themeColors.textSecondary }]}>
              Goal: {goalValue} {unit}{' '}
              {goalPeriod === 'day' ? 'per day' : goalPeriod === 'week' ? 'per week' : 'per month'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleLabel: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  toggleDesc: { fontSize: 13 },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  configBox: { padding: 16, borderRadius: 12, gap: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valueInput: {
    width: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  unitLabel: { fontSize: 15 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodPill: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  periodText: { fontSize: 13, fontWeight: '500' },
  preview: { fontSize: 12, fontStyle: 'italic' },
});
```

---

## STEP 6 — Create `components/SchedulePicker.tsx`

Create a new file at `components/SchedulePicker.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import type { ScheduleType, DayOfWeek } from '../types';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface SchedulePickerProps {
  scheduleType: ScheduleType;
  scheduleDays: DayOfWeek[];
  color: string;
  onChange: (type: ScheduleType, days: DayOfWeek[]) => void;
}

export const SchedulePicker: React.FC<SchedulePickerProps> = ({
  scheduleType, scheduleDays, color, onChange,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  const handleTypePress = (type: ScheduleType) => {
    if (type === 'daily') {
      onChange('daily', []);
    } else {
      onChange('custom', scheduleDays.length > 0 ? scheduleDays : [1, 2, 3, 4, 5] as DayOfWeek[]);
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    const next = scheduleDays.includes(day)
      ? scheduleDays.filter(d => d !== day)
      : ([...scheduleDays, day].sort((a, b) => a - b) as DayOfWeek[]);
    onChange('custom', next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.typeRow}>
        {([
          { key: 'daily' as ScheduleType, label: 'Every day' },
          { key: 'custom' as ScheduleType, label: 'Specific days' },
        ]).map(opt => {
          const active = scheduleType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.typePill,
                {
                  backgroundColor: active ? color : themeColors.surface,
                  borderColor: active ? color : themeColors.border,
                },
              ]}
              onPress={() => handleTypePress(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.typePillText, { color: active ? '#fff' : themeColors.textSecondary }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {scheduleType === 'custom' && (
        <View style={styles.daysRow}>
          {DAY_LABELS.map((label, idx) => {
            const day = idx as DayOfWeek;
            const active = scheduleDays.includes(day);
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: active ? color : themeColors.surface,
                    borderColor: active ? color : themeColors.border,
                  },
                ]}
                onPress={() => toggleDay(day)}
                activeOpacity={0.75}
              >
                <Text style={[styles.dayChipText, { color: active ? '#fff' : themeColors.textSecondary }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typePill: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  typePillText: { fontSize: 13, fontWeight: '500' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayChipText: { fontSize: 13, fontWeight: '600' },
});
```

---

## STEP 7 — Create `components/StreakFeatures.tsx`

Create a new file at `components/StreakFeatures.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { getMilestoneForStreak, getNextMilestone, getEffectiveSkipTokens, todayISO } from '../lib/features';
import { useFeaturesStore } from '../state/featuresSlice';
import { useMarksStore } from '../state/countersSlice';

// ── Milestone Banner ──────────────────────────────────────

interface StreakMilestoneBannerProps {
  streak: number;
  color: string;
}

export const StreakMilestoneBanner: React.FC<StreakMilestoneBannerProps> = ({ streak, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const milestone = getMilestoneForStreak(streak);
  const next = getNextMilestone(streak);

  if (!milestone && !next) return null;

  return (
    <LinearGradient
      colors={[color + '22', color + '0A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.milestoneBanner, { borderColor: color + '40' }]}
    >
      <View style={styles.milestoneRow}>
        <Text style={styles.milestoneEmoji}>{milestone ? milestone.emoji : '🌱'}</Text>
        <View style={{ flex: 1 }}>
          {milestone && (
            <Text style={[styles.milestoneTitle, { color: themeColors.text }]}>
              {milestone.label}
            </Text>
          )}
          {next && (
            <Text style={[styles.milestoneSub, { color: themeColors.textSecondary }]}>
              {milestone
                ? `Next: ${next.label} at ${next.days} days (${next.days - streak} to go)`
                : `First milestone in ${next.days - streak} day${next.days - streak !== 1 ? 's' : ''}`}
            </Text>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

// ── Skip Token Row ────────────────────────────────────────

interface SkipTokenRowProps {
  markId: string;
  userId: string;
  color: string;
}

export const SkipTokenRow: React.FC<SkipTokenRowProps> = ({ markId, userId, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const mark = useMarksStore(s => s.marks.find(m => m.id === markId));
  const { isDateProtected, useSkipToken } = useFeaturesStore();
  const [loading, setLoading] = useState(false);

  if (!mark) return null;

  const available = getEffectiveSkipTokens(mark);
  const today = todayISO();
  const isProtected = isDateProtected(markId, today);

  const handleUse = () => {
    if (available <= 0) {
      Alert.alert('No tokens left', 'Skip tokens refill at the start of each month.');
      return;
    }
    if (isProtected) {
      Alert.alert('Already protected', "Today's streak is already protected.");
      return;
    }
    Alert.alert(
      'Use a skip token?',
      `Protect your streak for today. You have ${available} token${available !== 1 ? 's' : ''} left this month.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use token',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setLoading(true);
            const result = await useSkipToken(markId, userId, today);
            setLoading(false);
            if (!result.success) Alert.alert('Error', result.message);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.tokenRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tokenTitle, { color: themeColors.text }]}>Skip tokens</Text>
        <Text style={[styles.tokenSub, { color: themeColors.textSecondary }]}>
          Protect your streak on missed days · resets monthly
        </Text>
      </View>
      <View style={styles.tokenRight}>
        <View style={styles.tokenDots}>
          {[0, 1].map(i => (
            <View
              key={i}
              style={[
                styles.tokenDot,
                {
                  backgroundColor: i < available ? color : 'transparent',
                  borderColor: i < available ? color : themeColors.border,
                },
              ]}
            />
          ))}
        </View>
        {isProtected ? (
          <View style={styles.protectedRow}>
            <Ionicons name="shield-checkmark" size={14} color={color} />
            <Text style={[styles.protectedText, { color }]}>Protected</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.useBtn,
              {
                backgroundColor: available > 0 ? color + '20' : themeColors.surface,
                borderColor: available > 0 ? color : themeColors.border,
              },
            ]}
            onPress={handleUse}
            disabled={loading || available <= 0}
            activeOpacity={0.7}
          >
            <Text style={[styles.useBtnText, { color: available > 0 ? color : themeColors.textSecondary }]}>
              {loading ? '…' : 'Use'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  milestoneBanner: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  milestoneEmoji: { fontSize: 24 },
  milestoneTitle: { fontSize: 15, fontWeight: '600' },
  milestoneSub: { fontSize: 12, marginTop: 2 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  tokenTitle: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  tokenSub: { fontSize: 11, lineHeight: 15 },
  tokenRight: { alignItems: 'flex-end', gap: 6 },
  tokenDots: { flexDirection: 'row', gap: 6 },
  tokenDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  protectedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  protectedText: { fontSize: 11, fontWeight: '500' },
  useBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  useBtnText: { fontSize: 11, fontWeight: '600' },
});
```

---

## STEP 8 — Create `components/NoteEditor.tsx`

Create a new file at `components/NoteEditor.tsx`:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { useFeaturesStore } from '../state/featuresSlice';
import { todayISO } from '../lib/features';

interface NoteEditorProps {
  markId: string;
  userId: string;
  date?: string; // defaults to today
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ markId, userId, date }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const targetDate = date ?? todayISO();
  const { getNoteForDate, upsertNote, deleteNote } = useFeaturesStore();
  const existingNote = getNoteForDate(markId, targetDate);

  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(existingNote?.text ?? '');
  const inputRef = useRef<TextInput>(null);
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isEditing) setText(existingNote?.text ?? '');
  }, [existingNote?.text, isEditing]);

  const startEditing = () => {
    setIsEditing(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start(
      () => inputRef.current?.focus(),
    );
  };

  const handleBlur = async () => {
    setIsEditing(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    const trimmed = text.trim();
    if (!trimmed && existingNote) {
      await deleteNote(existingNote.id);
    } else if (trimmed) {
      await upsertNote(markId, userId, targetDate, trimmed);
    }
  };

  const handleDelete = async () => {
    setText('');
    Keyboard.dismiss();
    setIsEditing(false);
    if (existingNote) await deleteNote(existingNote.id);
  };

  const hasNote = (existingNote?.text ?? '').length > 0;
  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.border, themeColors.primary],
  });

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
          Today's note
        </Text>
        {hasNote && !isEditing && (
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={[styles.box, { backgroundColor: themeColors.surface, borderColor }]}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onBlur={handleBlur}
            placeholder="Add a note for today…"
            placeholderTextColor={themeColors.textSecondary}
            style={[styles.input, { color: themeColors.text }]}
            multiline
            maxLength={500}
            returnKeyType="done"
            blurOnSubmit
          />
        ) : (
          <TouchableOpacity onPress={startEditing} activeOpacity={0.7} style={styles.touchable}>
            {hasNote ? (
              <Text style={[styles.noteText, { color: themeColors.text }]} numberOfLines={3}>
                {existingNote!.text}
              </Text>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="create-outline" size={16} color={themeColors.textSecondary} />
                <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                  Add a note for today…
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  box: { borderWidth: 1, borderRadius: 12, minHeight: 54 },
  touchable: { padding: 14, minHeight: 54, justifyContent: 'center' },
  noteText: { fontSize: 15, lineHeight: 22 },
  placeholder: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeholderText: { fontSize: 15 },
  input: { padding: 14, fontSize: 15, lineHeight: 22, minHeight: 54 },
});
```

---

## STEP 9 — Create `components/BackupRestoreSection.tsx`

Create a new file at `components/BackupRestoreSection.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { exportBackup, importBackup } from '../lib/backup';
import { useMarksStore } from '../state/countersSlice';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/utils/logger';

export const BackupRestoreSection: React.FC = () => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const { user } = useAuth();
  const loadMarks = useMarksStore(s => s.loadMarks);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    const result = await exportBackup();
    setExporting(false);
    if (!result.success) Alert.alert('Export failed', result.message);
  };

  const handleImport = () => {
    Alert.alert('Restore backup', 'How would you like to restore?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Merge (keep existing data)', onPress: () => doImport('merge') },
      {
        text: 'Replace all data',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Replace all data?',
            'This will overwrite all current marks and history. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace', style: 'destructive', onPress: () => doImport('replace') },
            ],
          ),
      },
    ]);
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    setImporting(true);
    try {
      const result = await importBackup(mode);
      setImporting(false);
      if (result.success) {
        await loadMarks(user?.id);
        Alert.alert('Restore complete', result.message);
      } else {
        Alert.alert('Restore failed', result.message);
      }
    } catch (err) {
      setImporting(false);
      logger.error('[BackupRestoreSection] error:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  const rows = [
    {
      icon: 'cloud-upload-outline' as const,
      label: 'Export backup',
      sub: 'Save all marks & history as a JSON file',
      onPress: handleExport,
      loading: exporting,
    },
    {
      icon: 'cloud-download-outline' as const,
      label: 'Restore backup',
      sub: 'Import a previously exported backup file',
      onPress: handleImport,
      loading: importing,
    },
  ];

  return (
    <>
      {rows.map(row => (
        <TouchableOpacity
          key={row.label}
          style={[styles.row, { backgroundColor: themeColors.surface }]}
          onPress={row.onPress}
          disabled={row.loading}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: themeColors.background }]}>
            {row.loading ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Ionicons name={row.icon} size={20} color={themeColors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: themeColors.text }]}>{row.label}</Text>
            <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>{row.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
        </TouchableOpacity>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowSub: { fontSize: 12 },
});
```

---

## STEP 10 — Edit `types/index.ts`

Open `types/index.ts`. Find the `Mark` type definition. Add these 6 optional fields to it, directly after the existing `updated_at` field:

```typescript
  // Feature 1: Habit Goals
  goal_value?: number | null;
  goal_period?: 'day' | 'week' | 'month' | null;

  // Feature 2: Flexible Schedules
  schedule_type?: 'daily' | 'weekly' | 'custom';
  schedule_days?: string; // JSON array string e.g. "[1,3,5]"  (0=Sunday)

  // Feature 3: Skip Tokens
  skip_tokens_remaining?: number;  // default 2, reset monthly
  skip_tokens_month?: string;      // "YYYY-MM" of last reset
```

Then add these new type exports **at the end of the file**, before any existing type aliases:

```typescript
// Feature 4: Notes
export type MarkNote = {
  id: string;
  mark_id: string;
  user_id: string;
  date: string;       // YYYY-MM-DD
  text: string;
  created_at: string;
  updated_at: string;
};

// Feature 3: Skip Token records
export type SkipToken = {
  id: string;
  mark_id: string;
  user_id: string;
  protected_date: string; // YYYY-MM-DD
  created_at: string;
};

// Streak Milestones
export type Milestone = {
  days: number;
  label: string;
  emoji: string;
};

export const STREAK_MILESTONES: Milestone[] = [
  { days: 3,   label: 'Getting started', emoji: '🌱' },
  { days: 7,   label: 'One week strong', emoji: '⚡' },
  { days: 14,  label: 'Two weeks solid', emoji: '🔥' },
  { days: 21,  label: 'Habit forming',   emoji: '🧠' },
  { days: 30,  label: 'One month!',      emoji: '🏆' },
  { days: 60,  label: 'Unstoppable',     emoji: '💎' },
  { days: 100, label: 'Elite tier',      emoji: '🚀' },
];

export function getMilestoneForStreak(streak: number): Milestone | null {
  const crossed = STREAK_MILESTONES.filter(m => streak >= m.days);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function getNextMilestone(streak: number): Milestone | null {
  return STREAK_MILESTONES.find(m => m.days > streak) ?? null;
}

export type GoalPeriod = 'day' | 'week' | 'month';
export type ScheduleType = 'daily' | 'weekly' | 'custom';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
```

---

## STEP 11 — Edit `app/_layout.tsx`

Open `app/_layout.tsx`. Find this block inside the `init` async function:

```typescript
    await initDatabase();
```

Replace it with:

```typescript
    await initDatabase();
    // Boot feature store (notes + skip tokens)
    const { useFeaturesStore } = await import('../state/featuresSlice');
    await useFeaturesStore.getState().loadFeatures();
```

---

## STEP 12 — Edit `app/counter/new.tsx`

### 12a — Add imports

Find this import line:

```typescript
import { DuplicateMarkError } from '../../state/countersSlice';
```

Add these imports directly after it:

```typescript
import { GoalSection } from '../../components/GoalSection';
import { SchedulePicker } from '../../components/SchedulePicker';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../types';
```

### 12b — Add state variables

Find this line in the component state declarations:

```typescript
  const [enableStreak, setEnableStreak] = useState(true);
```

Add these 4 new state lines directly after it:

```typescript
  const [goalValue, setGoalValue] = useState<number | null>(null);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>([]);
```

### 12c — Pass new fields to createCounter in handleSave

Find the `createCounter` call inside `handleSave`:

```typescript
      await createCounter({
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
        user_id: user?.id!,
      });
```

Replace it with:

```typescript
      await createCounter({
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
        user_id: user?.id!,
        goal_value: goalValue,
        goal_period: goalValue ? goalPeriod : null,
        schedule_type: scheduleType,
        schedule_days: scheduleType === 'custom' ? JSON.stringify(scheduleDays) : undefined,
      } as any);
```

### 12d — Add Goal and Schedule sections to the custom form JSX

In the custom mode `ScrollView`, find the Enable Streak section. The code starts with:

```typescript
        {/* Enable Streak Toggle */}
        <View style={styles.section}>
```

Insert this block **immediately before** that Enable Streak section:

```tsx
        {/* Goal (Feature 1) */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Goal (optional)</Text>
          <GoalSection
            goalValue={goalValue}
            goalPeriod={goalPeriod}
            unit={unit}
            color={color}
            onChange={(v, p) => { setGoalValue(v); setGoalPeriod(p); }}
          />
        </View>

        {/* Schedule (Feature 2) */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Schedule</Text>
          <SchedulePicker
            scheduleType={scheduleType}
            scheduleDays={scheduleDays}
            color={color}
            onChange={(t, d) => { setScheduleType(t); setScheduleDays(d); }}
          />
        </View>
```

---

## STEP 13 — Edit `app/counter/[id]/edit.tsx`

### 13a — Add imports

Find this import:

```typescript
import { useCounters } from '../../../hooks/useCounters';
```

Add these imports directly after it:

```typescript
import { GoalSection } from '../../../components/GoalSection';
import { SchedulePicker } from '../../../components/SchedulePicker';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../../types';
import { parseScheduleDays } from '../../../lib/features';
```

### 13b — Add state variables, pre-populated from existing counter

Find this line in the component state:

```typescript
  const [enableStreak, setEnableStreak] = useState(counter?.enable_streak ?? true);
```

Add these 4 lines directly after it:

```typescript
  const [goalValue, setGoalValue] = useState<number | null>(counter?.goal_value ?? null);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>((counter?.goal_period as GoalPeriod) ?? 'day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>((counter?.schedule_type as ScheduleType) ?? 'daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>(counter ? parseScheduleDays(counter) : []);
```

### 13c — Pass new fields to updateCounter in handleSave

Find the `updateCounter` call inside `handleSave`:

```typescript
      await updateCounter(id, {
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
      });
```

Replace it with:

```typescript
      await updateCounter(id, {
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
        goal_value: goalValue,
        goal_period: goalValue ? goalPeriod : null,
        schedule_type: scheduleType,
        schedule_days: scheduleType === 'custom' ? JSON.stringify(scheduleDays) : undefined,
      } as any);
```

### 13d — Add Goal and Schedule sections to edit form JSX

Find the Enable Streak toggle section in the JSX. It starts with:

```typescript
        {/* Enable Streak Toggle */}
        <View style={styles.section}>
```

Insert this block **immediately before** it:

```tsx
        {/* Goal (Feature 1) */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Goal (optional)</Text>
          <GoalSection
            goalValue={goalValue}
            goalPeriod={goalPeriod}
            unit={unit}
            color={color}
            onChange={(v, p) => { setGoalValue(v); setGoalPeriod(p); }}
          />
        </View>

        {/* Schedule (Feature 2) */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Schedule</Text>
          <SchedulePicker
            scheduleType={scheduleType}
            scheduleDays={scheduleDays}
            color={color}
            onChange={(t, d) => { setScheduleType(t); setScheduleDays(d); }}
          />
        </View>
```

---

## STEP 14 — Edit `app/counter/[id].tsx`

### 14a — Add imports

Find this import line:

```typescript
import { logger } from '../../lib/utils/logger';
```

Add these 3 imports directly after it:

```typescript
import { StreakMilestoneBanner, SkipTokenRow } from '../../components/StreakFeatures';
import { NoteEditor } from '../../components/NoteEditor';
import { GoalProgressBar } from '../../components/GoalProgressBar';
```

### 14b — Add new feature blocks into the ScrollView

Find this exact block in the JSX — the comment and opening of the streak module gradient:

```typescript
          {/* Streak Module with Brand/Primary Tint (12% opacity) - Moved down */}
          {streak && counter.enable_streak && (
            <LinearGradient
```

Insert this block **immediately before** that comment (i.e., before `{/* Streak Module`):

```tsx
          {/* Milestone Banner (Feature 3) */}
          {streak && counter.enable_streak && (
            <StreakMilestoneBanner
              streak={streak.current_streak}
              color={counter.color || themeColors.primary}
            />
          )}

          {/* Goal Progress Bar — full variant (Feature 1) */}
          <GoalProgressBar
            mark={counter}
            events={events}
            color={counter.color || themeColors.primary}
            variant="full"
          />
```

Then find the **closing** of the streak module block. It ends with `)}` after the LinearGradient closing. After that closing `)}`, insert:

```tsx
          {/* Skip Tokens (Feature 3) */}
          {counter.enable_streak && user?.id && (
            <View style={{ marginBottom: spacing.lg }}>
              <SkipTokenRow
                markId={counter.id}
                userId={user.id}
                color={counter.color || themeColors.primary}
              />
            </View>
          )}

          {/* Daily Note (Feature 4) */}
          {user?.id && (
            <View style={{ marginBottom: spacing.lg }}>
              <NoteEditor markId={counter.id} userId={user.id} />
            </View>
          )}
```

Place these two blocks **before** the chart section (`{/* Chart Section */}` or the `<View style={styles.chartSection}>`).

---

## STEP 15 — Edit `components/CounterTile.tsx`

### 15a — Add imports

Find this import at the top of the file:

```typescript
import { applyOpacity } from '@/src/components/icons/color';
```

Add these two imports directly after it:

```typescript
import { GoalProgressBar } from './GoalProgressBar';
import { useEventsStore } from '../state/eventsSlice';
```

### 15b — Add the GoalProgressBarOnTile helper component

Find the `MarkTile` component definition. It starts with:

```typescript
export const MarkTile: React.FC<MarkTileProps> = ({
```

Add this helper component **immediately before** the `MarkTile` definition (not inside it):

```typescript
// Subscribes to events store only for marks that have a goal set
const GoalProgressBarOnTile: React.FC<{ markId: string; mark: Mark; color: string }> = React.memo(
  ({ markId, mark, color }) => {
    const events = useEventsStore(s => s.events.filter(e => e.mark_id === markId && !e.deleted_at));
    if (!mark.goal_value) return null;
    return (
      <View style={{ marginTop: 4 }}>
        <GoalProgressBar mark={mark} events={events} color={color} variant="compact" />
      </View>
    );
  },
);
```

### 15c — Add goal bar into the tile JSX

Inside the `MarkTile` JSX, find the `valueBlock` View. It contains the unit `AppText`. The unit line looks like:

```tsx
        <AppText variant="label" style={[styles.unit, { color: themeColors.textSecondary }]}>
          {String(mark.unit ?? '')}
        </AppText>
      </View>
```

(The `</View>` closes the `valueBlock`.)

Replace that closing section with:

```tsx
        <AppText variant="label" style={[styles.unit, { color: themeColors.textSecondary }]}>
          {String(mark.unit ?? '')}
        </AppText>
        <GoalProgressBarOnTile markId={mark.id} mark={mark} color={markColor} />
      </View>
```

---

## STEP 16 — Edit `app/(tabs)/settings.tsx`

### 16a — Add import

Find this import in settings.tsx:

```typescript
import { logger } from '../../lib/utils/logger';
```

Add this import directly after it:

```typescript
import { BackupRestoreSection } from '../../components/BackupRestoreSection';
```

### 16b — Add backup buttons to the Data section

Find the Export CSV button and the closing of the Data section `</View>`. The code looks like:

```tsx
          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.surface }]}
            onPress={handleExportCSV}
          >
            <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
              Export CSV
            </AppText>
          </TouchableOpacity>
        </View>
```

Replace it with:

```tsx
          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.surface }]}
            onPress={handleExportCSV}
          >
            <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
              Export CSV
            </AppText>
          </TouchableOpacity>

          {/* Backup & Restore (Feature 5) */}
          <BackupRestoreSection />
        </View>
```

---

## STEP 17 — Verify no TypeScript errors

After all edits, run:

```bash
npx tsc --noEmit
```

Common issues to fix if they appear:
- If `tsc` complains about `goal_value` etc. on the `createCounter` / `updateCounter` call, the `as any` cast already handles it — make sure the cast is present.
- If `GoalProgressBarOnTile` causes a "used before defined" error, move it above `MarkTile` (it should already be above it per the instructions).
- If `parseScheduleDays` import fails in `edit.tsx`, check the relative path matches where `lib/features.ts` was created.

---

## Summary of all files changed / created

| Action | File |
|--------|------|
| **CREATE** | `lib/features.ts` |
| **CREATE** | `lib/backup.ts` |
| **CREATE** | `state/featuresSlice.ts` |
| **CREATE** | `components/GoalProgressBar.tsx` |
| **CREATE** | `components/GoalSection.tsx` |
| **CREATE** | `components/SchedulePicker.tsx` |
| **CREATE** | `components/StreakFeatures.tsx` |
| **CREATE** | `components/NoteEditor.tsx` |
| **CREATE** | `components/BackupRestoreSection.tsx` |
| **EDIT** | `types/index.ts` — add 6 fields to Mark + new types |
| **EDIT** | `app/_layout.tsx` — call loadFeatures() on startup |
| **EDIT** | `app/counter/new.tsx` — Goal + Schedule UI + save fields |
| **EDIT** | `app/counter/[id]/edit.tsx` — Goal + Schedule UI + save fields |
| **EDIT** | `app/counter/[id].tsx` — Milestone, GoalBar, SkipTokens, Note |
| **EDIT** | `components/CounterTile.tsx` — compact GoalBar on tile |
| **EDIT** | `app/(tabs)/settings.tsx` — BackupRestoreSection |

**No existing functionality is broken.** Every new field on `Mark` is optional. Every new component renders nothing when the feature is not configured.
