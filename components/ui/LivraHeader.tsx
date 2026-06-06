import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgLogo } from './SvgLogo';
import { fonts, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

// DrawerContext kept for backward compat — no longer wired to any drawer.
// Components that import DrawerContext will get a no-op context.
export const DrawerContext = React.createContext<{ open: () => void; close: () => void }>({
  open: () => {},
  close: () => {},
});

interface LivraHeaderProps {
  showBack?: boolean;
  onBackPress?: () => void;
  showAvatar?: boolean;
  centerLogo?: boolean;
  title?: string;
  avatarUri?: string | null;
  rightIcon?: string;
  onRightPress?: () => void;
}

export function LivraHeader({
  showBack,
  onBackPress,
  showAvatar,
  centerLogo,
  title,
  avatarUri: _avatarUri,
  rightIcon,
  onRightPress,
}: LivraHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useEffectiveTheme();
  const colors = themedColors(theme);

  const left = showBack ? (
    <TouchableOpacity
      style={styles.iconBtn}
      onPress={() => (onBackPress ? onBackPress() : router.back())}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="arrow-left" size={22} color={colors.inkDark} />
    </TouchableOpacity>
  ) : (
    <View style={styles.leftPlaceholder} />
  );

  const right =
    rightIcon && onRightPress ? (
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onRightPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name={rightIcon as any} size={20} color={colors.danger} />
      </TouchableOpacity>
    ) : showAvatar ? (
      <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceAlt, borderColor: colors.forest }]} />
    ) : (
      <View style={styles.leftPlaceholder} />
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.linen, paddingTop: insets.top }]}>
      <View style={styles.row}>
        {left}
        <View style={styles.center}>
          {centerLogo ? (
            <SvgLogo color={colors.forest} width={32} height={16} />
          ) : title ? (
            <Text style={[styles.title, { color: colors.inkDark }]}>{title}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftPlaceholder: {
    width: 22,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
});
