import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { themedColors, fonts, fontSize, spacing, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import type { Mark } from '../../types';

// ── Pure helper exports (used by tests and component alike) ──────────────────

/**
 * Returns a human-readable label for a weekly frequency value.
 *   1 → "Once a week"
 *   2 → "Twice a week"
 *   7 → "Every day"
 *   3–6 → "N× a week"
 */
export function frequencyLabel(n: number): string {
  if (n === 1) return 'Once a week';
  if (n === 2) return 'Twice a week';
  if (n === 7) return 'Every day';
  return `${n}× a week`;
}

/**
 * Derive the set of preset chip values from [min, recommended, max].
 * Deduplicates and sorts ascending.
 */
export function deriveChipValues(min: number, recommended: number, max: number): number[] {
  const unique = Array.from(new Set([min, recommended, max]));
  return unique.sort((a, b) => a - b);
}

// ── Component ────────────────────────────────────────────────────────────────

type MarkFrequencyProps = Pick<
  Mark,
  'frequency_min' | 'frequency_recommended' | 'frequency_max' | 'weekly_target' | 'frequency_kind' | 'name'
>;

type Props = {
  mark: MarkFrequencyProps;
  onChange: (target: number) => void;
  disabled?: boolean;
};

export function MarkFrequencyPicker({ mark, onChange, disabled = false }: Props) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  const { frequency_min, frequency_recommended, frequency_max, weekly_target, frequency_kind, name } = mark;

  // A mark is fixed when min and max are both non-null and equal.
  const isFixed =
    frequency_min != null && frequency_max != null && frequency_min === frequency_max;

  if (isFixed) {
    // Derive the stated line for fixed marks
    let statedLine: string;
    if (frequency_kind === 'abstinence') {
      statedLine = 'Every day';
    } else if (frequency_kind === 'fixed' || name?.toLowerCase() === 'sleep') {
      statedLine = 'Every night';
    } else {
      statedLine = frequencyLabel(frequency_max ?? 7);
    }

    return (
      <View style={styles.statedWrap}>
        <Text style={[styles.statedText, { color: c.inkMuted, fontFamily: fonts.sans }]}>
          {statedLine}
        </Text>
      </View>
    );
  }

  // Variable mark — build preset chips
  const min = frequency_min ?? 1;
  const rec = frequency_recommended ?? 3;
  const max = frequency_max ?? 7;

  const chipValues = deriveChipValues(min, rec, max);
  const selected = weekly_target ?? rec;

  return (
    <View style={styles.chipsRow}>
      {chipValues.map((value) => {
        const isSelected = value === selected;
        const isRec = value === rec;

        return (
          <TouchableOpacity
            key={value}
            style={[
              styles.chip,
              isSelected
                ? { backgroundColor: c.forest, borderColor: c.forest }
                : { backgroundColor: c.surface, borderColor: c.borderMid },
              disabled && styles.chipDisabled,
            ]}
            onPress={() => {
              if (!disabled) onChange(value);
            }}
            disabled={disabled}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled }}
          >
            <Text
              style={[
                styles.chipText,
                isSelected
                  ? { color: '#FFFFFF', fontFamily: fonts.sansSemibold }
                  : { color: c.inkDark, fontFamily: fonts.sans },
                disabled && !isSelected && { color: c.inkMuted },
              ]}
            >
              {frequencyLabel(value)}
              {isRec && !isSelected ? ' ·' : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  statedWrap: {
    paddingVertical: spacing.xs,
  },
  statedText: {
    fontSize: fontSize.base,
    fontStyle: 'italic',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipDisabled: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: fontSize.sm,
  },
});
