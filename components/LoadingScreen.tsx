import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { SvgLogo } from './ui/SvgLogo';

const LOGO_SIZE = 180;

interface LoadingScreenProps {
  showSpinner?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ showSpinner = true }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <SvgLogo color={themeColors.text} width={LOGO_SIZE} height={LOGO_SIZE} />
      {showSpinner && (
        <ActivityIndicator
          size="large"
          color={themeColors.primary}
          style={styles.spinner}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    marginTop: 48,
  },
});

