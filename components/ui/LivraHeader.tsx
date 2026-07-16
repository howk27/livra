import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { ArrowLeft, type Icon as PhosphorIcon } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgLogo } from './SvgLogo';
import {
  fonts,
  spacing,
  themedColors,
  fontSize,
  headerControl,
  headerControlBoxLeading,
  headerControlBoxTrailing,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

// DrawerContext kept for backward compat — no longer wired to any drawer.
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
  rightIcon?: PhosphorIcon;
  onRightPress?: () => void;
}

export function LivraHeader({
  showBack,
  onBackPress,
  showAvatar,
  centerLogo,
  title,
  avatarUri: _avatarUri,
  rightIcon: RightIconComponent,
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
    >
      <ArrowLeft size={22} color={colors.inkDark} weight="regular" />
    </TouchableOpacity>
  ) : (
    <View style={styles.leftPlaceholder} />
  );

  const right =
    RightIconComponent && onRightPress ? (
      <TouchableOpacity style={styles.iconBtnRight} onPress={onRightPress}>
        <RightIconComponent size={20} color={colors.danger} weight="duotone" />
      </TouchableOpacity>
    ) : showAvatar ? (
      <TouchableOpacity
        style={styles.iconBtnRight}
        onPress={() => router.push('/settings/profile' as any)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarRingWrapper}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceAlt, borderColor: colors.forest }]} />
        </View>
      </TouchableOpacity>
    ) : (
      <View style={styles.leftPlaceholder} />
    );

  // QC4-K: the row is offset from the safe-area inset by headerControl.topGap
  // rather than sitting flush against it, so the back control never lands in the
  // notch / Dynamic Island / gesture strip.
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.linen, paddingTop: insets.top + headerControl.topGap },
      ]}
    >
      <View style={styles.row}>
        {left}
        <View style={styles.center}>
          {centerLogo ? (
            <SvgLogo color={theme === 'dark' ? colors.inkDark : colors.forest} width={32} height={16} />
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
    paddingBottom: spacing.sm,
  },
  row: {
    height: headerControl.minTarget,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftPlaceholder: {
    width: 22,
  },
  iconBtn: {
    ...headerControlBoxLeading,
  },
  iconBtnRight: {
    ...headerControlBoxTrailing,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.lg,
  },
  avatarRingWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
  },
});
