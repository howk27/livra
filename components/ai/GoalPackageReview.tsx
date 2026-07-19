/**
 * GoalPackageReview — the AI package review surface, extracted from
 * app/onboarding.tsx renderAIReview (FU-6) so onboarding and /goal/suggest
 * consume one implementation (no fork).
 *
 * Owns the editable state (title, notes, mark selection) and hands the caller
 * a final selection on confirm. Review is mandatory and editable; nothing is
 * auto-activated. Deselection floor: at least one mark stays selected.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check } from 'phosphor-react-native';
import { PillButton } from '../ui/PillButton';
import { fonts, radius, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import {
  buildReadinessLine,
  resolveMarkForAIIcon,
  type AIGoalPackage,
  type AIGoalMark,
} from '../../lib/ai/goalGeneration';
import { applyOpacity } from '../../src/components/icons/color';
import { MARK_LIBRARY_BY_ID } from '../../lib/suggestedCounters';

export type GoalPackageReviewSelection = {
  /** Edited (or original) goal title, trimmed; falls back to the package title. */
  title: string;
  /** Optional user note; undefined when left blank. */
  description?: string;
  /** The marks the user kept selected, in package order. */
  marks: AIGoalMark[];
};

interface GoalPackageReviewProps {
  pkg: AIGoalPackage;
  onConfirm: (selection: GoalPackageReviewSelection) => void;
  onDismiss: () => void;
  /** Dismiss link label: onboarding says "Set it up myself", suggest says "Start over". */
  dismissLabel: string;
  /** Disables the confirm CTA while the caller persists. */
  confirming?: boolean;
}

export function GoalPackageReview({
  pkg,
  onConfirm,
  onDismiss,
  dismissLabel,
  confirming,
}: GoalPackageReviewProps) {
  const c = themedColors(useEffectiveTheme());

  const [title, setTitle] = useState(pkg.goalTitle);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(pkg.marks.map((_, i) => i)),
  );
  const [description, setDescription] = useState('');
  const descriptionRef = useRef('');

  const handleDescriptionChange = useCallback((text: string) => {
    descriptionRef.current = text;
    setDescription(text);
  }, []);

  const handleConfirm = useCallback(() => {
    const marks = pkg.marks.filter((_, i) => selected.has(i));
    if (marks.length === 0) return;
    onConfirm({
      title: title.trim() || pkg.goalTitle,
      description: descriptionRef.current.trim() || undefined,
      marks,
    });
  }, [pkg, selected, title, onConfirm]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: c.inkDark }]}>{"Here's what Livra suggests."}</Text>
        <Text style={[styles.subtitle, { color: c.inkMid }]}>Edit anything before you commit.</Text>

        {/* Editable goal title */}
        <View style={styles.fieldBlock}>
          <Text style={[styles.label, { color: c.inkMuted }]}>GOAL</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: c.surfaceAlt, color: c.inkDark, borderColor: c.borderLight },
            ]}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            placeholder="Goal title"
            placeholderTextColor={c.inkMuted}
          />
        </View>

        {/* Timeframe (display only) + the client-derived readiness date (QC3-C) */}
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.label, { color: c.inkMuted }]}>TIMEFRAME</Text>
          <Text style={[styles.timeframe, { color: c.inkDark }]}>{pkg.timeframeWeeks} weeks</Text>
          <Text style={[styles.readiness, { color: c.inkMid }]}>
            {buildReadinessLine(title.trim() || pkg.goalTitle, pkg.timeframeWeeks)}
          </Text>
        </View>

        {/* Editable description */}
        <View style={styles.fieldBlock}>
          <Text style={[styles.label, { color: c.inkMuted }]}>NOTES (OPTIONAL)</Text>
          <TextInput
            style={[
              styles.descriptionInput,
              { backgroundColor: c.surfaceAlt, color: c.inkDark, borderColor: c.borderLight },
            ]}
            value={description}
            onChangeText={handleDescriptionChange}
            placeholder="Add a note about this goal (optional)."
            placeholderTextColor={c.inkMuted}
            multiline
            maxLength={280}
          />
        </View>

        {/* Marks with why */}
        <View style={{ marginTop: spacing.xl }}>
          <Text style={[styles.label, { color: c.inkMuted }]}>SUGGESTED MARKS</Text>
          <View style={styles.marksList}>
            {pkg.marks.map((m, i) => {
              const isSelected = selected.has(i);
              const resolved = resolveMarkForAIIcon(m.icon);
              const MarkIcon = MARK_LIBRARY_BY_ID[resolved.markId]?.icon;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.markRow,
                    { backgroundColor: c.surface, borderColor: c.borderLight },
                    !isSelected && styles.markRowDeselected,
                  ]}
                  activeOpacity={0.75}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) {
                        if (next.size > 1) next.delete(i);
                      } else {
                        next.add(i);
                      }
                      return next;
                    });
                  }}
                >
                  <View style={[styles.markIconTile, { backgroundColor: applyOpacity(resolved.color, 0.12) }]}>
                    {MarkIcon ? <MarkIcon size={18} color={resolved.color} weight="duotone" /> : null}
                  </View>
                  <View style={styles.markInfo}>
                    <Text style={[styles.markName, { color: isSelected ? c.inkDark : c.inkMuted }]}>
                      {m.name} · {m.frequency}×/wk
                    </Text>
                    <Text style={[styles.markWhy, { color: c.inkMuted }]}>{m.why}</Text>
                  </View>
                  <View
                    style={[
                      styles.markCheck,
                      isSelected
                        ? { backgroundColor: c.forest, borderColor: c.forest }
                        : { borderColor: c.borderMid },
                    ]}
                  >
                    {isSelected && <Check size={12} weight="bold" color={c.inkInverse} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <PillButton
          label="Looks good →"
          onPress={handleConfirm}
          disabled={selected.size === 0 || confirming}
          style={{ ...styles.primaryBtn, opacity: selected.size === 0 ? 0.4 : 1 }}
        />

        <TouchableOpacity
          style={styles.dismissWrap}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
        >
          <Text style={[styles.dismissLink, { color: c.inkMid }]}>{dismissLabel}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 100,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize['2xl'],
    marginTop: spacing.xl,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  fieldBlock: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    borderWidth: 1,
  },
  timeframe: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    paddingVertical: spacing.xs,
  },
  readiness: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  descriptionInput: {
    minHeight: 72,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    borderWidth: 1,
    textAlignVertical: 'top',
  },
  marksList: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  markRowDeselected: {
    opacity: 0.45,
  },
  markIconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markInfo: {
    flex: 1,
  },
  markName: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  markWhy: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
    lineHeight: 17,
  },
  markCheck: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    marginTop: spacing.xxl,
    height: 52,
    width: '100%',
  },
  dismissWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  dismissLink: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    textAlign: 'center',
  },
});
