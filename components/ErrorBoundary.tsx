import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { logger } from '../lib/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    // Reset error state to allow retry
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use fallback UI if provided, otherwise use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onReload={this.handleReload} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReload: () => void;
}

function ErrorFallback({ error, onReload }: ErrorFallbackProps) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconContainer}>
          <Text style={[styles.icon, { color: themeColors.error }]}>⚠️</Text>
        </View>

        <Text style={[styles.title, { color: themeColors.text }]}>
          Something went wrong
        </Text>

        <Text style={[styles.message, { color: themeColors.textSecondary }]}>
          We're sorry, but something unexpected happened. Don't worry, your data is safe.
        </Text>

        {__DEV__ && error && (
          <View style={[styles.errorContainer, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.errorTitle, { color: themeColors.error }]}>
              Error Details (Development Only)
            </Text>
            <Text style={[styles.errorText, { color: themeColors.textSecondary }]}>
              {error.toString()}
            </Text>
            {error.stack && (
              <Text style={[styles.errorStack, { color: themeColors.textSecondary }]}>
                {error.stack}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: themeColors.primary }]}
          onPress={onReload}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
            Try Again
          </Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
          If this problem persists, please restart the app or contact support.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  message: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  errorContainer: {
    width: '100%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    maxHeight: 300,
  },
  errorTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    marginBottom: spacing.xs,
  },
  errorStack: {
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
    opacity: 0.7,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  hint: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
