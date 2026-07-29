// lib/data/connectivity.ts
//
// M9 Phase 1 — wire React Query's `onlineManager` to the device network state via
// `expo-network` (Expo-managed, SDK-matched; chosen over NetInfo per the plan).
// This is what lets React Query pause/resume fetches with real connectivity and
// makes offline reads come from the persisted cache instead of hanging.

import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

/** Treat "internet reachable" as the source of truth; fall back to "connected",
 * then optimistically to online (a failed request will correct a wrong guess). */
function isOnline(state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isInternetReachable ?? state.isConnected ?? true;
}

/**
 * Register the network listener with React Query. Call once at app start; returns
 * a teardown that removes the listener. Defensive by design — if the native module
 * is unavailable (e.g. a test import), it never throws and leaves RQ assuming online.
 */
export function initNetworkOnlineManager(): () => void {
  onlineManager.setEventListener((setOnline) => {
    // Seed from the current state immediately, then follow changes.
    Network.getNetworkStateAsync()
      .then((state) => setOnline(isOnline(state)))
      .catch(() => setOnline(true));

    let subscription: { remove: () => void } | null = null;
    try {
      subscription = Network.addNetworkStateListener((state) => setOnline(isOnline(state)));
    } catch {
      // Native module missing — stay optimistic; requests still fail loudly if offline.
      setOnline(true);
    }
    return () => subscription?.remove();
  });

  // Teardown: replace the listener with a no-op so nothing keeps firing.
  return () => onlineManager.setEventListener(() => () => {});
}
