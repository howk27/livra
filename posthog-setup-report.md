<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Livra. The SDK (`posthog-react-native`) and peer dependency (`react-native-svg`) were already installed. The existing `lib/analytics/posthog.ts` wrapper and `lib/analytics/events.ts` catalog were extended rather than replaced, preserving the project's existing patterns.

**Changes made:**

- **`.env`** — Set `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` (were missing; analytics was silently disabled at runtime).
- **`lib/analytics/events.ts`** — Added `USER_SIGNED_IN` and `USER_SIGNED_UP` event constants.
- **`lib/analytics/posthog.ts`** — Added `screenTrack()` (wraps `client.screen()`) and `captureException()` (wraps `client.captureException()`) to the safe no-op wrapper.
- **`app/_layout.tsx`** — Added screen tracking via `usePathname` + `useGlobalSearchParams`; each route change fires `screenTrack(pathname, { previous_screen, ...params })`. Imported `screenTrack` from the wrapper.
- **`app/auth/signin.tsx`** — Added `user_signed_in` capture (email + Apple paths) and `user_signed_up` capture (email path) with `method` property. Added `identify(userId, { $set: { auth_provider } })` on each successful auth event.

**Pre-existing instrumentation (untouched):**

| Event | File |
|---|---|
| `goal_created` | `state/goalsSlice.ts` |
| `goal_completed` | `state/goalsSlice.ts` |
| `mark_logged` | `hooks/useCounters.ts` |
| `onboarding_completed` | `app/onboarding.tsx` |
| `paywall_viewed` | `app/paywall.tsx` |
| `subscription_started` | `app/paywall.tsx` |

**Events added in this run:**

| Event | Description | File |
|---|---|---|
| `user_signed_in` | Fires when a user successfully signs in via email or Apple Sign-In | `app/auth/signin.tsx` |
| `user_signed_up` | Fires when a user successfully creates a new account via email or Apple Sign-In | `app/auth/signin.tsx` |

## Next steps

We've built a dashboard and five insights based on the instrumented events:

- **Dashboard:** [Analytics basics (wizard)](https://us.posthog.com/project/508011/dashboard/1834654)
- [New signups (wizard)](https://us.posthog.com/project/508011/insights/BBYszCUW) — daily sign-up trend (30 days)
- [Subscription conversion funnel (wizard)](https://us.posthog.com/project/508011/insights/oTrcCRzj) — paywall viewed → subscription started
- [Daily marks logged (wizard)](https://us.posthog.com/project/508011/insights/UvHn4ItQ) — core-loop engagement (30 days)
- [Goals created vs completed (wizard)](https://us.posthog.com/project/508011/insights/OBFLJ1xn) — north-star metric (90 days)
- [Onboarding completion funnel (wizard)](https://us.posthog.com/project/508011/insights/sy1Rw7fp) — sign-up → onboarding completed (3-day window)

## Verify before merging

- [ ] Run a full production build and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — the `analyticsPosthog.test.ts` file mocks `posthog-react-native` and may need to cover `screenTrack` and `captureException` if those are exercised in tests.
- [ ] Add `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` to `.env.example` and any onboarding scripts so collaborators know what to set.
- [ ] Confirm the returning-visitor path also calls `identify` — the current `_layout.tsx` handler identifies on every sign-in transition, but verify a user who restores a persisted session (cold launch while already signed in) is also identified before their first event fires.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
