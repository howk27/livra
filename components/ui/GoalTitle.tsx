import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { fonts, themedColors, fontSize, spacing } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';

export type GoalTitleSize = 'card' | 'detail';

export interface GoalTitleProps {
  title: string;
  /** 'card' = fontSize 22 (Focus/Goals cards); 'detail' = fontSize 26 (goal detail hero). */
  size?: GoalTitleSize;
  /** Ember hairline under the title. Defaults on for 'detail', off for 'card'. */
  flourish?: boolean;
  /** Title ink override (e.g. future dark-card use). Defaults to inkDark. */
  color?: string;
  /** Container style passthrough (layout: flex, margins). */
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's Signature voice: the goal title in Cormorant serif, 2-line max,
 * sentence case exactly as the user authored it (never transformed).
 * Personality lives in type, plus a single quiet ember flourish on detail.
 */
export function GoalTitle({ title, size = 'card', flourish, color, style }: GoalTitleProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const showFlourish = flourish ?? size === 'detail';
  return (
    <View style={style}>
      <Text
        testID="goal-title-text"
        style={[size === 'detail' ? styles.titleDetail : styles.titleCard, { color: color ?? c.inkDark }]}
        numberOfLines={2}
      >
        {title}
      </Text>
      {showFlourish && (
        <View
          testID="goal-title-flourish"
          style={[styles.flourish, { backgroundColor: applyOpacity(c.ember, 0.6) }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  titleCard: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize[22],
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  titleDetail: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize[26],
    lineHeight: 33,
    letterSpacing: -0.3,
  },
  flourish: {
    width: 24,
    height: 2,
    borderRadius: 1,
    marginTop: spacing.sm,
  },
});
