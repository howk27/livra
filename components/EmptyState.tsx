import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon = '📊',
  actionLabel,
  onAction,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  return (
    <View style={styles.container}>
      <AppText variant="display" style={[styles.icon, { color: themeColors.text }]}>
        {icon}
      </AppText>
      <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
        {title}
      </AppText>
      <AppText variant="body" style={[styles.message, { color: themeColors.textSecondary }]}>
        {message}
      </AppText>

      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: themeColors.primary }]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
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
  icon: {
    fontSize: 60,
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

