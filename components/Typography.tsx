import React from 'react';
import { Text, TextProps } from 'react-native';
import { typography, TypographyVariant } from '../theme/typography';

type Props = TextProps & {
  variant?: TypographyVariant;
};

export const AppText: React.FC<Props> = ({ variant = 'body', style, children, ...rest }) => {
  const variantStyle = typography[variant] ?? typography.body;
  return (
    <Text {...rest} style={[variantStyle, style]}>
      {children}
    </Text>
  );
};


