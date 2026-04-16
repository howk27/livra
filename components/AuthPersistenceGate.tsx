import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { AuthPersistenceBanner } from './AuthPersistenceBanner';

/**
 * Overlay for session persistence issues (SecureStore write failures). Does not cover the whole screen with pointer capture.
 */
export function AuthPersistenceGate() {
  const { persistenceWarning, dismissPersistenceWarning } = useAuth();

  if (!persistenceWarning) {
    return null;
  }

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <AuthPersistenceBanner visible onDismiss={dismissPersistenceWarning} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    zIndex: 100,
    elevation: 100,
  },
});
