// Shared goal-journal compose field: a multiline input + "Add entry" button,
// owning the draft/saving/canAdd/handleAdd lifecycle. Extracted from the
// goal-detail preview (app/goal/[id].tsx) and the full journal screen
// (app/goal/journal/[id].tsx) so the two can never diverge (QC3 cleanup).
//
// The parent supplies onAdd(text) and owns any haptics + persistence; the
// composer only manages the draft and clears the field on a successful add.
// showCharCount + inputMinHeight preserve each host's exact rendered layout:
//   - full journal screen: char count shown, taller field (84);
//   - detail preview: no char count, shorter field (72), button right-aligned.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Plus } from 'phosphor-react-native';
import { themedColors, spacing, fontSize, borderRadius, fonts } from '../../theme/tokens';

type ThemeColors = ReturnType<typeof themedColors>;

const DEFAULT_MAX_LEN = 1000;
const DEFAULT_PLACEHOLDER = "What did you do, what's working, what's not?";

export function JournalComposer({
  c,
  onAdd,
  showCharCount = false,
  inputMinHeight = 72,
  maxLen = DEFAULT_MAX_LEN,
  placeholder = DEFAULT_PLACEHOLDER,
}: {
  c: ThemeColors;
  onAdd: (text: string) => Promise<void>;
  showCharCount?: boolean;
  inputMinHeight?: number;
  maxLen?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const trimmed = draft.trim();
  const canAdd = trimmed.length > 0 && !saving;

  const handleAdd = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.composer, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
      <TextInput
        value={draft}
        onChangeText={(t) => setDraft(t.slice(0, maxLen))}
        placeholder={placeholder}
        placeholderTextColor={c.inkMuted}
        multiline
        style={[
          styles.composerInput,
          { minHeight: inputMinHeight, color: c.inkDark, borderColor: c.borderMid, backgroundColor: c.surface },
        ]}
        textAlignVertical="top"
      />
      <View style={[styles.composerActions, showCharCount ? null : styles.composerActionsEnd]}>
        {showCharCount ? (
          <Text style={[styles.charCount, { color: c.inkMid }]}>
            {draft.length}/{maxLen}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: canAdd ? c.forest : c.surfaceAlt }]}
          onPress={handleAdd}
          disabled={!canAdd}
          activeOpacity={0.85}
          accessibilityLabel="Add journal entry"
        >
          <Plus size={14} color={canAdd ? c.inkInverse : c.inkMuted} weight="bold" />
          <Text style={[styles.addBtnText, { color: canAdd ? c.inkInverse : c.inkMuted }]}>
            {saving ? 'Adding…' : 'Add entry'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  composerInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    fontFamily: fonts.sans,
    lineHeight: 22,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  composerActionsEnd: {
    justifyContent: 'flex-end',
  },
  charCount: { fontSize: fontSize.xs, fontFamily: fonts.sans },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44, // QC3 wave2: tap-target floor
    borderRadius: borderRadius.md,
  },
  addBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sansSemibold },
});
