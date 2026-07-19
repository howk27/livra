import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, PencilSimple, Trash, Check } from 'phosphor-react-native';
import {
  themedColors,
  spacing,
  fontSize,
  borderRadius,
  fonts,
  headerControl,
  headerControlBoxLeading,
} from '../../../theme/tokens';
import type { GoalNote } from '../../../types';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useGoalsStore } from '../../../state/goalsSlice';
import { useGoalNotesStore } from '../../../state/goalNotesSlice';
import { useAuth } from '../../../hooks/useAuth';
import { getAppDate } from '../../../lib/appDate';
import { formatDate } from '../../../lib/date';
import { applyOpacity } from '../../../src/components/icons/color';
import { JournalComposer } from '../../../components/journal/JournalComposer';
import { confirm } from '../../../components/ui/overlays';

type ThemeColors = ReturnType<typeof themedColors>;

const ENTRY_MAX_LEN = 1000;

/** 'yyyy-MM-dd' → local-safe "Wed, Jul 15" (parse as local midnight, no UTC shift). */
function dayLabel(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function entryTime(createdAt: string): string {
  try {
    return format(parseISO(createdAt), 'h:mm a');
  } catch {
    return '';
  }
}

/** One entry: read view with edit/delete affordances, or an inline edit field. */
function JournalEntryRow({
  c,
  entry,
  onEdit,
  onDelete,
}: {
  c: ThemeColors;
  entry: GoalNote;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setDraft(entry.text);
    setEditing(true);
  };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === entry.text.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit(entry.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <View style={styles.entryRow}>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, ENTRY_MAX_LEN))}
          multiline
          autoFocus
          style={[styles.editInput, { color: c.inkDark, borderColor: c.borderMid, backgroundColor: c.surface }]}
          textAlignVertical="top"
        />
        <View style={styles.entryEditActions}>
          <TouchableOpacity onPress={() => setEditing(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <Text style={[styles.entryEditCancel, { color: c.inkMuted }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.entrySaveBtn, { backgroundColor: c.forest }]}
            onPress={saveEdit}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Check size={14} color={c.inkInverse} weight="bold" />
            <Text style={[styles.entrySaveText, { color: c.inkInverse }]}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.entryRow}>
      <View style={styles.entryHeader}>
        <Text style={[styles.entryTime, { color: c.inkMid }]}>{entryTime(entry.created_at)}</Text>
        <View style={styles.entryHeaderActions}>
          <TouchableOpacity onPress={beginEdit} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} activeOpacity={0.7}>
            <PencilSimple size={16} color={c.inkMuted} weight="duotone" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(entry.id)} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} activeOpacity={0.7}>
            <Trash size={16} color={c.inkMuted} weight="duotone" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.entryText, { color: c.inkDark }]}>{entry.text.trim()}</Text>
    </View>
  );
}

export default function GoalJournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const noteUserId = user?.id ?? 'local';

  const goal = useGoalsStore((s) => s.goals.find((g) => g.id === id));
  const loading = useGoalNotesStore((s) => s.loading);
  const entriesAll = useGoalNotesStore((s) => s.entries);
  const cloudError = useGoalNotesStore((s) => s.goalNotesCloudError);
  const clearCloudError = useGoalNotesStore((s) => s.clearGoalNotesCloudError);
  const addGoalNote = useGoalNotesStore((s) => s.addGoalNote);
  const editGoalNote = useGoalNotesStore((s) => s.editGoalNote);
  const deleteGoalNote = useGoalNotesStore((s) => s.deleteGoalNote);

  // Newest-first, grouped by local_date preserving that order.
  const dayGroups = useMemo(() => {
    const rows = entriesAll
      .filter((n) => n.goal_id === id)
      .sort((a, b) =>
        a.created_at !== b.created_at
          ? b.created_at.localeCompare(a.created_at)
          : b.id.localeCompare(a.id),
      );
    const groups: { date: string; entries: GoalNote[] }[] = [];
    for (const row of rows) {
      const last = groups[groups.length - 1];
      if (last && last.date === row.local_date) {
        last.entries.push(row);
      } else {
        groups.push({ date: row.local_date, entries: [row] });
      }
    }
    return groups;
  }, [entriesAll, id]);

  const handleAdd = useCallback(
    async (text: string) => {
      if (!id) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const localDate = formatDate(getAppDate());
      await addGoalNote(id, noteUserId, localDate, text);
    },
    [id, noteUserId, addGoalNote],
  );

  const handleEdit = useCallback(
    async (noteId: string, text: string) => {
      await editGoalNote(noteId, noteUserId, text);
    },
    [noteUserId, editGoalNote],
  );

  const handleDelete = useCallback(
    async (noteId: string) => {
      const ok = await confirm({
        title: 'Delete entry?',
        message: 'This journal entry will be permanently removed.',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep it',
        destructive: true,
      });
      if (ok) void deleteGoalNote(noteId);
    },
    [deleteGoalNote],
  );

  if (!goal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: c.linen, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: fonts.sans, color: c.inkMuted }}>Goal not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: spacing.md }} activeOpacity={0.7}>
          <Text style={{ fontFamily: fonts.sansMedium, color: c.forest }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} activeOpacity={0.7}>
          <X size={22} color={c.inkDark} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.inkDark }]} numberOfLines={1}>
          Journal
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xl * 2 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.goalName, { color: c.inkMid }]} numberOfLines={2}>
            {goal.title}
          </Text>

          <JournalComposer c={c} onAdd={handleAdd} showCharCount inputMinHeight={84} maxLen={ENTRY_MAX_LEN} />

          {cloudError ? (
            <View style={[styles.cloudRow, { borderColor: c.borderLight }]}>
              <Text style={[styles.cloudHint, { color: c.inkMid }]}>{cloudError}</Text>
              <TouchableOpacity onPress={() => clearCloudError()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                <Text style={[styles.cloudDismiss, { color: c.accent }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {loading && dayGroups.length === 0 ? (
            <View style={styles.stateBlock}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[styles.skeletonRow, { backgroundColor: applyOpacity(c.inkMuted, 0.12) }]}
                />
              ))}
            </View>
          ) : dayGroups.length === 0 ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.emptyLine, { color: c.inkMid }]}>
                {"Nothing here yet. Add the first note above: what you did, what's working, what's not."}
              </Text>
            </View>
          ) : (
            dayGroups.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <Text style={[styles.dayHeader, { color: c.inkMid }]}>{dayLabel(group.date)}</Text>
                <View style={[styles.dayCard, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
                  {group.entries.map((entry, i) => (
                    <View key={entry.id}>
                      {i > 0 && <View style={[styles.entrySeparator, { backgroundColor: c.borderLight }]} />}
                      <JournalEntryRow
                        c={c}
                        entry={entry}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  // QC4-K: close offset from the safe-area inset by headerControl.topGap, on a
  // 44pt target (was hitSlop 8 on a 22pt icon).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
  },
  headerBtn: { ...headerControlBoxLeading },
  headerTitle: { fontFamily: fonts.sansSemibold, fontSize: fontSize.md },
  // Matches headerBtn's width so the title stays optically centred.
  headerSpacer: { width: headerControl.minTarget },
  content: { paddingHorizontal: spacing.lg },
  // MED-A: the goal name renders here as a small italic context line under the
  // "Journal" header, not as a hero/title, so it comes off Cormorant. FLAGGED
  // for founder review (borderline goal-title vs. context label).
  goalName: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },

  // Cloud error
  cloudRow: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  cloudHint: { fontSize: fontSize.sm, fontFamily: fonts.sans, lineHeight: 18 },
  cloudDismiss: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },

  // States
  stateBlock: { marginTop: spacing.xl, gap: spacing.sm },
  emptyLine: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 24,
    textAlign: 'center',
  },
  skeletonRow: { height: 52, borderRadius: borderRadius.md },

  // Day groups
  dayGroup: { marginTop: spacing.lg, gap: spacing.xs },
  // QC3 wave2: sentence-case date label as authored by dayLabel() — no tracked
  // uppercase kicker (design-system ban).
  dayHeader: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sansSemibold,
    marginBottom: spacing.xs,
  },
  dayCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
  },
  entryRow: { paddingVertical: spacing.md, gap: spacing.xs },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  entryHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  entryTime: { fontSize: fontSize.xs, fontFamily: fonts.sans },
  entryText: { fontSize: fontSize.md, fontFamily: fonts.sans, lineHeight: 22 },
  entrySeparator: { height: StyleSheet.hairlineWidth },

  // Inline edit
  editInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 72,
    fontSize: fontSize.md,
    fontFamily: fonts.sans,
    lineHeight: 22,
  },
  entryEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  entryEditCancel: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },
  entrySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44, // QC3 wave2: tap-target floor
    borderRadius: borderRadius.md,
  },
  entrySaveText: { fontSize: fontSize.sm, fontFamily: fonts.sansSemibold },
});
