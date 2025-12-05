import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SUGGESTED_COUNTERS_BY_CATEGORY, SuggestedCounter } from '../lib/suggestedCounters';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity } from '@/src/components/icons/color';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 10; // Increased spacing between cards
const CARDS_PER_ROW = 3;
// Calculate card size: with marginHorizontal: CARD_MARGIN/2 (5px each side), we have:
// - CARD_MARGIN/2 on left of first card
// - CARD_MARGIN/2 on right of last card  
// - CARD_MARGIN between each pair of cards (5px + 5px)
// Total margin space = CARD_MARGIN/2 + (CARDS_PER_ROW - 1) * CARD_MARGIN + CARD_MARGIN/2 = CARDS_PER_ROW * CARD_MARGIN
const TOTAL_HORIZONTAL_PADDING = spacing.lg * 2; // Left and right padding
const TOTAL_MARGIN_SPACE = CARDS_PER_ROW * CARD_MARGIN; // Total horizontal margin space
const CARD_SIZE = (SCREEN_WIDTH - TOTAL_HORIZONTAL_PADDING - TOTAL_MARGIN_SPACE) / CARDS_PER_ROW;

interface SuggestedCountersListProps {
  onCounterSelect?: (counter: SuggestedCounter) => void;
  maxSelections?: number;
  selectedCounters?: SuggestedCounter[];
}

export const SuggestedCountersList: React.FC<SuggestedCountersListProps> = ({
  onCounterSelect,
  maxSelections,
  selectedCounters = [],
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  const isSelected = (counter: SuggestedCounter) => {
    return selectedCounters.some(
      (c) => c.name === counter.name && c.emoji === counter.emoji
    );
  };

  const canSelectMore = () => {
    if (!maxSelections) return true;
    return selectedCounters.length < maxSelections;
  };

  const handleCounterPress = (counter: SuggestedCounter) => {
    if (!onCounterSelect) return;

    if (isSelected(counter)) {
      // Deselect
      const updated = selectedCounters.filter(
        (c) => !(c.name === counter.name && c.emoji === counter.emoji)
      );
      onCounterSelect(counter); // Let parent handle the deselection logic
    } else {
      // Select
      if (canSelectMore()) {
        onCounterSelect(counter);
      }
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {SUGGESTED_COUNTERS_BY_CATEGORY.map((category, categoryIndex) => (
        <View key={categoryIndex} style={styles.categorySection}>
          {(category.title || category.emoji) && (
            <View style={styles.categoryHeader}>
              {category.emoji ? <Text style={styles.categoryEmoji}>{category.emoji}</Text> : null}
              {category.title ? (
                <Text style={[styles.categoryTitle, { color: themeColors.text }]}>
                  {category.title}
                </Text>
              ) : null}
            </View>
          )}

          {/* Counters in this category - Grid Layout */}
          <View style={styles.countersGrid}>
            {category.counters.map((counter, counterIndex) => {
              const selected = isSelected(counter);
              const disabled = !selected && !canSelectMore();
              const iconType = resolveCounterIconType({
                name: counter.name,
                emoji: counter.emoji,
              });

              return (
                <TouchableOpacity
                  key={counterIndex}
                  style={[
                    styles.counterCard,
                    {
                      width: CARD_SIZE,
                      height: CARD_SIZE,
                      backgroundColor: selected
                        ? applyOpacity(counter.color, 0.12)
                        : themeColors.surface,
                      borderColor: selected
                        ? counter.color
                        : themeColors.border,
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => handleCounterPress(counter)}
                  disabled={disabled && !selected}
                  activeOpacity={0.8}
                >
                  {/* Glow effect for selected */}
                  {selected && (
                    <View
                      style={[
                        styles.glowEffect,
                        {
                          backgroundColor: applyOpacity(counter.color, 0.08),
                          borderColor: applyOpacity(counter.color, 0.25),
                        },
                      ]}
                    />
                  )}
                  
                  {/* Content */}
                  <View style={styles.cardContent}>
                    {iconType ? (
                      <CounterIcon
                        type={iconType}
                        size={28}
                        variant="withBackground"
                        fallbackEmoji={counter.emoji}
                        ariaLabel={`${counter.name} counter icon`}
                        color={counter.color}
                      />
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

                  {/* Selection indicator */}
                  {selected && (
                    <View
                      style={[
                        styles.selectionBadge,
                        { 
                          backgroundColor: counter.color,
                          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : themeColors.border,
                        },
                      ]}
                    >
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
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
    marginBottom: spacing.xl,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryEmoji: {
    fontSize: fontSize.xl,
    marginRight: spacing.sm,
  },
  categoryTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold, // BOLD category titles
  },
  countersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  counterCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: CARD_MARGIN,
    marginHorizontal: CARD_MARGIN / 2, // Half margin on each side for proper spacing
    overflow: 'hidden',
    position: 'relative',
    // Futuristic styling with enhanced shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  glowEffect: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    zIndex: 0,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    zIndex: 1,
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
  selectionBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    // Futuristic glow with stronger shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 2,
    // borderColor will be set dynamically in the component
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});
