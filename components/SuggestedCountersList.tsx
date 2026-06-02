import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SUGGESTED_COUNTERS_BY_CATEGORY, SuggestedCounter } from '../lib/suggestedCounters';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { applyOpacity } from '@/src/components/icons/color';
import { getCategoryColor, getCategoryForSuggestedCounter } from '../lib/markCategory';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
// Two columns to match Add Mark suggested layout (reference: narrow grid cards)
const CARDS_PER_ROW = 2;
// Calculate card size: with marginHorizontal: CARD_MARGIN/2 (5px each side), we have:
// - CARD_MARGIN/2 on left of first card
// - CARD_MARGIN/2 on right of last card  
// - CARD_MARGIN between each pair of cards (5px + 5px)
// Total margin space = CARD_MARGIN/2 + (CARDS_PER_ROW - 1) * CARD_MARGIN + CARD_MARGIN/2 = CARDS_PER_ROW * CARD_MARGIN
const TOTAL_HORIZONTAL_PADDING = spacing.lg * 2; // Left and right padding
const TOTAL_MARGIN_SPACE = CARDS_PER_ROW * CARD_MARGIN; // Total horizontal margin space
const CARD_SIZE = (SCREEN_WIDTH - TOTAL_HORIZONTAL_PADDING - TOTAL_MARGIN_SPACE) / CARDS_PER_ROW;

export interface SuggestedMarksListProps {
  onMarkSelect?: (mark: SuggestedCounter) => void;
  maxSelections?: number;
  selectedMarks?: SuggestedCounter[];
  contentBottomPadding?: number;
  /** @deprecated Use onMarkSelect */
  onCounterSelect?: (counter: SuggestedCounter) => void;
  /** @deprecated Use selectedMarks */
  selectedCounters?: SuggestedCounter[];
}

/** @deprecated Alias kept for backward compat */
export type SuggestedCountersListProps = SuggestedMarksListProps;

export const SuggestedMarksList: React.FC<SuggestedMarksListProps> = ({
  onMarkSelect,
  onCounterSelect,
  maxSelections,
  selectedMarks,
  selectedCounters = [],
  contentBottomPadding = spacing.xl,
}) => {
  const resolvedOnSelect = onMarkSelect ?? onCounterSelect;
  const resolvedSelected = selectedMarks ?? selectedCounters;
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  const isSelected = (counter: SuggestedCounter) => {
    return resolvedSelected.some(
      (c) => c.name === counter.name && c.emoji === counter.emoji
    );
  };

  const canSelectMore = () => {
    if (!maxSelections) return true;
    return resolvedSelected.length < maxSelections;
  };

  const handleCounterPress = (counter: SuggestedCounter) => {
    if (!resolvedOnSelect) return;
    if (canSelectMore() || isSelected(counter)) {
      resolvedOnSelect(counter);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
    >
      {SUGGESTED_COUNTERS_BY_CATEGORY.map((category, categoryIndex) => (
        <View key={categoryIndex} style={styles.categorySection}>
          {category.title && (
            <View style={styles.categoryHeader}>
              <View style={[styles.categoryAccent, { backgroundColor: themeColors.accent.primary }]} />
              {category.title ? (
                <Text style={[styles.categoryTitle, { color: themeColors.text }]}>
                  {category.title}
                </Text>
              ) : null}
            </View>
          )}

          {/* Counters in this category - Grid Layout */}
          <View style={styles.countersGrid}>
            {category.marks.map((counter, counterIndex) => {
              const selected = isSelected(counter);
              const disabled = !selected && !canSelectMore();
              const markCategory = getCategoryForSuggestedCounter(counter);
              const categoryColor = getCategoryColor(markCategory);
              const MarkIcon = counter.icon;

              return (
                <TouchableOpacity
                  key={counterIndex}
                  style={[
                    styles.counterCard,
                    {
                      width: CARD_SIZE,
                      height: CARD_SIZE,
                      backgroundColor: selected
                        ? applyOpacity(categoryColor, 0.12)
                        : themeColors.surface,
                      borderColor: selected
                        ? categoryColor
                        : themeColors.border,
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => handleCounterPress(counter)}
                  disabled={disabled && !selected}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardContent}>
                    {MarkIcon ? (
                      <MarkIcon weight="duotone" size={28} color={counter.color} />
                    ) : (
                      <Text style={styles.counterEmoji}>{counter.emoji}</Text>
                    )}
                    <Text
                      style={[styles.counterName, { color: themeColors.text }]}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {counter.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  categoryTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  countersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
  },
  counterCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: CARD_MARGIN,
    marginHorizontal: CARD_MARGIN / 2,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  counterEmoji: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  counterName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.3,
  },
});

/** @deprecated Use SuggestedMarksList */
export const SuggestedCountersList = SuggestedMarksList;
