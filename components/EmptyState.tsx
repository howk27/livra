import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { themedColors, fontSize } from '../theme/tokens';
import { spacing, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: string;
  iconElement?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon = '📊',
  iconElement,
  actionLabel,
  onAction,
}) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  return (
    <View style={styles.container}>
      {iconElement ? (
        <View style={styles.iconSlot}>{iconElement}</View>
      ) : (
        <AppText variant="display" style={[styles.icon, { color: c.inkDark }]}>
          {icon}
        </AppText>
      )}
      <AppText variant="headline" style={[styles.title, { color: c.inkDark }]}>
        {title}
      </AppText>
      <AppText variant="body" style={[styles.message, { color: c.inkMid }]}>
        {message}
      </AppText>

      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: c.forest }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <AppText variant="button" style={[styles.buttonText, { color: c.inkInverse }]}>
            {actionLabel}
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconSlot: {
    marginBottom: spacing.lg,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: fontSize['6xl'],
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    opacity: 0.9,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
  },
  buttonText: {
    textAlign: 'center',
  },
});

