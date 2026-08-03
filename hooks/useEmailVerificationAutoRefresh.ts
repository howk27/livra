// Foreground re-check for soft email verification (2026-08-02 QA).
//
// The verify flow completes OUTSIDE the app: the user opens Mail, taps the
// link, the website stamps profiles.email_verified_at — and the app, which read
// the stamp exactly once on mount, kept showing the banner until a manual
// "I opened the link" tap. Returning to the foreground IS the signal that the
// user may just have done that, so this re-reads the stamp then. The manual
// button is retired by this hook.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  shouldRecheckVerification,
  type VerificationStamp,
} from '../lib/auth/emailVerification';
import { fetchEmailVerifiedAt } from '../lib/auth/emailVerificationService';

/**
 * When the app returns to 'active' and the account is not known-verified,
 * re-read profiles.email_verified_at and hand a fresh stamp to `onStamped`.
 * Never calls back without a stamp; never overlaps its own reads.
 *
 * Latest props live in a ref so the AppState subscription is created once per
 * client instead of churning every render (the listener reads current state at
 * fire time, which is the only time it matters).
 */
export function useEmailVerificationAutoRefresh(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  emailVerifiedAt: VerificationStamp,
  onStamped: (stamp: string) => void,
): void {
  const latest = useRef({ userId, emailVerifiedAt, onStamped });
  useEffect(() => {
    latest.current = { userId, emailVerifiedAt, onStamped };
  });
  const inFlight = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const current = latest.current;
      if (!current.userId) return;
      if (!shouldRecheckVerification(current.userId, current.emailVerifiedAt)) return;
      if (inFlight.current) return;
      inFlight.current = true;
      void (async () => {
        try {
          const stamped = await fetchEmailVerifiedAt(supabase, current.userId!);
          // Re-read the ref: sign-out or a competing read may have landed while
          // this one was in the air.
          if (stamped && latest.current.userId === current.userId) {
            latest.current.onStamped(stamped);
          }
        } finally {
          inFlight.current = false;
        }
      })();
    });
    return () => subscription.remove();
  }, [supabase]);
}
