import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { spacing, borderRadius } from '../../theme/tokens';

export type CardRadiusKey = 'sm' | 'md' | 'lg' | 'xl' | 'card';

export type CardProps = {
  children: React.ReactNode;
  backgroundColor: string;
  borderColor: string;
  /** Matches common Livra surfaces (stats category, settings groups, paywall notices) */
  borderRadiusKey?: CardRadiusKey;
  /** When set, applies `spacing[paddingKey]` inside the card */
  paddingKey?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  backgroundColor,
  borderColor,
  borderRadiusKey = 'card',
  paddingKey,
  style,
}: CardProps) {
  const pad =
    paddingKey !== undefined && paddingKey in spacing
      ? { padding: spacing[paddingKey as keyof typeof spacing] }
      : undefined;

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor,
          borderColor,
          borderRadius: borderRadius[borderRadiusKey],
        },
        pad,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
