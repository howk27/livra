import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { ArrowLeft, type Icon as PhosphorIcon } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { SvgLogo } from './SvgLogo';
import { fonts, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useXP } from '../../hooks/useXP';

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
  const { progressRatio } = useXP();

  const left = showBack ? (
    <TouchableOpacity
      style={styles.iconBtn}
      onPress={() => (onBackPress ? onBackPress() : router.back())}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <ArrowLeft size={22} color={colors.inkDark} weight="regular" />
    </TouchableOpacity>
  ) : (
    <View style={styles.leftPlaceholder} />
  );

  const right =
    RightIconComponent && onRightPress ? (
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onRightPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <RightIconComponent size={20} color={colors.danger} weight="duotone" />
      </TouchableOpacity>
    ) : showAvatar ? (
      <TouchableOpacity
        onPress={() => router.push('/settings/profile' as any)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <View style={styles.avatarRingWrapper}>
          <Svg width={36} height={36} style={{ position: 'absolute', top: 0, left: 0 }}>
            <Circle cx={18} cy={18} r={16} stroke={colors.borderLight} strokeWidth={2} fill="none" />
            <Circle
              cx={18}
              cy={18}
              r={16}
              stroke={colors.mint}
              strokeWidth={2}
              fill="none"
              strokeDasharray={`${2 * Math.PI * 16}`}
              strokeDashoffset={`${2 * Math.PI * 16 * (1 - progressRatio)}`}
              strokeLinecap="round"
              rotation="-90"
              origin="18,18"
            />
          </Svg>
          <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceAlt, borderColor: colors.forest }]} />
        </View>
      </TouchableOpacity>
    ) : (
      <View style={styles.leftPlaceholder} />
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.linen, paddingTop: insets.top }]}>
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
