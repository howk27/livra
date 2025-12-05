import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../../theme/colors';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  DEFAULT_ICON_SIZE,
  ICON_BACKGROUND_ALPHA,
  ICON_STROKE_WIDTH,
  ICON_TONE_COLOR_TOKENS,
} from './IconTokens';
import { getIconDefinition } from './IconRegistry';
import { applyOpacity } from './color';
import type {
  CounterIconAnimation,
  CounterIconVariant,
  CounterSymbolProps,
  CounterTone,
  CounterType,
} from '../../types/counters';

const BACKGROUND_SCALE = 1.25;

const getToneColor = (tone: CounterTone, theme: 'light' | 'dark') =>
  ICON_TONE_COLOR_TOKENS[tone]?.[theme];

export interface CounterIconProps {
  type: CounterType;
  size?: number;
  tone?: CounterTone;
  variant?: CounterIconVariant;
  animate?: CounterIconAnimation;
  ariaLabel?: string;
  fallbackEmoji?: string;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export const CounterIcon: React.FC<CounterIconProps> = ({
  type,
  size = DEFAULT_ICON_SIZE,
  tone,
  variant = 'symbol',
  animate = 'none',
  ariaLabel,
  fallbackEmoji = '📊',
  color,
  style,
}) => {
  const theme = useEffectiveTheme();
  const prefersReducedMotion = useReducedMotion();
  const definition = getIconDefinition(type);
  const themeColors = colors[theme];
  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) as ViewStyle | undefined, [style]);

  const resolvedTone: CounterTone = tone ?? definition?.defaultTone ?? 'misc';

  const symbolColor = useMemo(() => {
    if (color) {
      return color;
    }
    if (flattenedStyle?.color && typeof flattenedStyle.color === 'string') {
      return flattenedStyle.color;
    }
    const toneColor = getToneColor(resolvedTone, theme);
    return toneColor ?? themeColors.text;
  }, [color, flattenedStyle?.color, resolvedTone, theme, themeColors.text]);

  const backgroundColor = useMemo(
    () =>
      variant === 'withBackground'
        ? applyOpacity(symbolColor, ICON_BACKGROUND_ALPHA)
        : 'transparent',
    [symbolColor, variant]
  );

  const backgroundDiameter = variant === 'withBackground' ? size * BACKGROUND_SCALE : size;
  const backgroundPadding = Math.max((backgroundDiameter - size) / 2, 0);
  const accessibilityLabel = ariaLabel ?? definition?.ariaLabel ?? 'Counter icon';

  // Animation hooks reserved for future implementation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const animationPreset: CounterIconAnimation = prefersReducedMotion ? 'none' : animate;

  if (!definition) {
    return (
      <View
        style={[
          styles.base,
          {
            width: backgroundDiameter,
            height: backgroundDiameter,
            borderRadius: backgroundDiameter / 2,
            backgroundColor,
            padding: backgroundPadding,
          },
          style,
        ]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.fallbackEmoji, { fontSize: size * 0.75 }]}>{fallbackEmoji}</Text>
      </View>
    );
  }

  const IconComponent = definition.component;
  const iconProps: CounterSymbolProps = {
    size,
    color: symbolColor,
    strokeWidth: ICON_STROKE_WIDTH,
  };

  return (
    <View
      style={[
        styles.base,
        variant === 'withBackground'
          ? {
              width: backgroundDiameter,
              height: backgroundDiameter,
              borderRadius: backgroundDiameter / 2,
              backgroundColor,
              padding: backgroundPadding,
            }
          : { width: size, height: size },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <IconComponent {...iconProps} />
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: {
    textAlign: 'center',
  },
});

export default CounterIcon;


