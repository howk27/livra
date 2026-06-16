import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { CheckCircle, WarningCircle, Warning, Info, X } from 'phosphor-react-native';
import { spacing, borderRadius, fontSize, fontWeight, shadow, themedColors } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationToastProps {
  notification: Notification | null;
  onDismiss: () => void;
}

const NotificationToast: React.FC<NotificationToastProps> = ({ notification, onDismiss }) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (notification) {
      // Show notification - start from above safe area
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });

      // Auto-dismiss after duration
      const duration = notification.duration || 3000;
      const timer = setTimeout(() => {
        translateY.value = withSpring(-100, { damping: 15, stiffness: 150 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onDismiss)();
        });
      }, duration);

      return () => clearTimeout(timer);
    } else {
      // Hide notification
      translateY.value = withSpring(-100, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [notification, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  // Calculate top position with safe area inset
  const topPosition = insets.top;

  if (!notification) return null;

  const renderIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle size={24} color="#FFFFFF" weight="fill" />;
      case 'error':
        return <WarningCircle size={24} color="#FFFFFF" weight="fill" />;
      case 'warning':
        return <Warning size={24} color="#FFFFFF" weight="fill" />;
      case 'info':
      default:
        return <Info size={24} color="#FFFFFF" weight="fill" />;
    }
  };

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return c.success;
      case 'error':
        return c.danger;
      case 'warning':
        return '#F97316';
      case 'info':
      default:
        return c.forest;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        animatedStyle,
        {
          backgroundColor: getBackgroundColor(),
          top: topPosition,
          ...shadow.lg,
        },
      ]}
    >
      <View style={styles.content}>
        {renderIcon()}
        <AppText variant="body" style={styles.message}>
          {notification.message}
        </AppText>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={20} color="#FFFFFF" weight="bold" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
    // top will be set dynamically based on safe area inset
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  message: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});

export default NotificationToast;

