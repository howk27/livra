// lib/data/queryClient.ts
//
// M9 Phase 2 — the single QueryClient instance, hoisted out of app/_layout.tsx so
// it is reachable from BOTH React (the provider) and non-React code (Zustand store
// actions that need to invalidate a query as a temporary Phase-2 bridge).

import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Defaults chosen so a persisted read survives a day offline; per-entity
// `staleTime` in lib/data/* overrides the floor.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnReconnect: true,
    },
  },
});

// Bump this string on any cached-shape change so a persisted cache from an older
// shape is discarded rather than rehydrated into new code. Phase 5's cutover
// depends on being able to force exactly this.
// v2: M9 Phase 5A cutover — nothing persisted before the cutover build may
// rehydrate into the post-cutover code.
export const QUERY_CACHE_BUSTER = 'livra-data-v2';
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

// Persist the query cache to AsyncStorage so reads are available offline. The
// outbox is NOT persisted here — Phase 4 owns it with its own durability.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'livra-rq-cache',
});
