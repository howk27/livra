import React from 'react';
import { View, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';

const APP_BRAND_LOGO_LIGHT = require('../assets/branding/Logo NoBG.png');
const APP_BRAND_LOGO_DARK = require('../assets/branding/Logo NoBG dark.png');

interface LoadingScreenProps {
  showSpinner?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ showSpinner = true }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const logoSource = theme === 'dark' ? APP_BRAND_LOGO_DARK : APP_BRAND_LOGO_LIGHT;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Image
        source={logoSource}
        style={styles.logo}
        resizeMode="contain"
      />
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
  logo: {
    width: 120,
    height: 120,
    marginBottom: 32,
  },
  spinner: {
    marginTop: 16,
  },
});

