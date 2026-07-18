// Founder bug 1 (2026-07-18): the Focus header's avatar circle never rendered
// the uploaded picture — LivraHeader accepted `avatarUri` and discarded it, and
// no caller ever loaded one. This hook is the single loader: cache-first from
// AsyncStorage (same 'profile_image_uri' key settings.tsx maintains) for an
// instant paint, then a fresh signed URL from Supabase storage, refreshed on
// every screen focus so a new upload shows up when the user returns.
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { getSupabaseClient } from '../lib/supabase';
import { getAvatarUrl } from '../lib/storage/avatarStorage';

const CACHE_KEY = 'profile_image_uri';

export function useProfileAvatar(enabled: boolean): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let cancelled = false;
      (async () => {
        try {
          const cached = await AsyncStorage.getItem(CACHE_KEY);
          if (!cancelled && cached) setUri(cached);

          const supabase = getSupabaseClient();
          const { data } = await supabase.auth.getSession();
          const userId = data.session?.user?.id;
          if (!userId) return;

          const fresh = await getAvatarUrl(userId);
          if (cancelled || !fresh) return;
          setUri(fresh);
          await AsyncStorage.setItem(CACHE_KEY, fresh);
        } catch {
          // Non-blocking: the placeholder circle remains.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [enabled])
  );

  return uri;
}
