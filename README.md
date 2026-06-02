# Livra

**Goal execution for iOS.** Not a habit tracker. Not a counter.

> *"Most people have a graveyard of abandoned goals. Livra is where goals actually get done — one at a time, in sequence."*

---

## What It Is

Livra is a goal execution app built around a simple idea: finish one thing before starting the next. Users queue goals, track daily marks, and build momentum through a system that believes in them — not one that shames them for missing a day.

**App Store category:** Productivity
**Platform:** iOS (Android planned post-launch)

---

## Core Concepts

### Goals
- Users queue up to 3 goals (free) or unlimited (Livra+), one active at a time
- **Completion**: goals complete when their mark count reaches the target (`target_mark_count`). Only marks complete goals — not deadlines.
- **Expiry**: if a deadline (`deadline_date`) passes while the goal is still active and incomplete, it expires. Expired goals advance the queue automatically.
- Completion history is permanent and visible in the Queue screen

### Marks
- Daily actions that move a goal forward (Sleep, Workout, Deep Work, Read, etc.)
- Marks live at the user level — they persist across goals
- Each mark can be linked to one or more goals; logging it credits all linked goals simultaneously
- Users can reorder marks freely; native integrations auto-log from Apple Health

### Goal Queue
- Goals are ordered in a queue; only the #1 goal is "active" at any time
- When the active goal completes or expires, the next queued goal auto-activates
- Drag/reorder supported on the Queue screen (up/down arrows in v1)

### Daily Check-in
- Single focused interaction, one tap, tied to the active goal

### Weekly Reflection
- Rule-based copy library across 5 performance tiers (strong / solid / inconsistent / missing / first week)
- Human voice throughout — no AI cost at launch

---

## Features

### Free Tier
- Up to 3 goals in queue (1 active)
- Up to 3 marks
- Daily check-in
- Weekly reflection
- Goal completion moment
- Basic notifications

### Livra+ ($4.99/mo)
- Unlimited goals and marks
- Mark reordering
- Apple Health integrations (Sleep, Workout, Steps, Hydration)
- Custom daily reminders for any mark
- Wake-up alarm deep-link (Sleep mark)
- CSV export
- Cloud backup / restore

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.85 + Expo SDK 56 |
| Language | TypeScript 6.0 (strict) |
| Navigation | Expo Router 4 (file-based) |
| State | Zustand + AsyncStorage |
| Data Fetching | TanStack Query |
| Local DB | SQLite (expo-sqlite) — offline-first |
| Backend | Supabase (auth + DB + Edge Functions) |
| Animations | React Native Reanimated 4.x |
| Gestures | React Native Gesture Handler |
| IAP | react-native-iap + Supabase Edge Function (receipt validation) |
| Health | HealthKit via expo-health |
| Notifications | expo-notifications |
| Testing | Jest + jest-expo |
| Build | EAS Build + EAS Submit |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (installed via `npx`)
- iOS Simulator (Mac) or physical device with Expo Go / dev build

### Installation

```bash
git clone <repo>
cd Livra
npm install
```

Create a `.env` file:
```
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Start the dev server:
```bash
npm start
```

Then press `i` for iOS, `a` for Android, or `w` for web.

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the RLS policies from `SUPABASE_RLS_POLICIES.sql`
3. Deploy the `validate-iap-receipt` Edge Function for subscription validation
4. Copy your project URL and anon key to `.env`

---

## Project Structure

```
app/
├── (tabs)/
│   ├── home.tsx          # Mark list, edit mode, pace banner
│   ├── queue.tsx         # Goal queue (active hero card + waiting list)
│   ├── marks.tsx         # Mark management
│   └── settings.tsx      # Preferences, theme, account
├── mark/[id].tsx          # Mark detail (health, reminders, history)
├── goal/
│   ├── queue.tsx          # Goal queue management
│   ├── complete.tsx       # Goal completion moment
│   ├── history.tsx        # Completed goals list
│   └── milestone.tsx      # Milestone notification screen
├── checkin.tsx            # Daily check-in flow
├── weekly-review.tsx      # Weekly reflection
├── paywall.tsx            # Livra+ subscription screen
└── onboarding.tsx         # First-run experience

components/
├── SortableMarkList.tsx   # Reanimated v4 drag-and-drop list
├── SortableMarkRow.tsx    # Per-row animated drag row
├── ActiveGoalBanner.tsx   # Home screen goal context
├── PaceBanner.tsx         # Behind-pace recalibration prompt
└── ...

lib/
├── iap/
│   ├── iap.ts             # Pro status, receipt validation
│   ├── iapReVerify.ts     # Silent 24h re-verify on launch
│   └── skus.ts            # Product IDs (single source of truth)
├── notifications/
│   ├── markReminder.ts    # Per-mark daily reminder scheduling
│   └── sleepNotification.ts
├── health/                # HealthKit read + permissions
├── db/                    # SQLite schema + migrations
└── paceEngine.ts          # Goal pace calculation + recalibration

state/
├── countersSlice.ts       # Marks store (primary export: useMarksStore)
├── goalsSlice.ts          # Goal queue store (primary export: useGoalsStore)
├── goalStore.ts           # Canonical import path for useGoalsStore
├── eventsSlice.ts         # Increment events (offline-first)
└── ...

tests/unit/               # Jest unit tests (251 tests)
```

---

## Commands

```bash
npm start              # Expo dev server
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Web (limited)
npm test               # Jest
npm run type-check     # TypeScript (tsc --noEmit)
npm run lint           # ESLint
npm run format         # Prettier

# EAS builds
npm run build:ios      # Production iOS build
npm run build:android  # Production Android build
npm run build:preview:ios  # Preview / TestFlight build
```

---

## Architecture Notes

**Marks are user-level, not goal-level.** Marks persist across goals — only the context (why this mark matters now) changes. Do not architect marks as children of goals.

**Offline-first.** All writes go to SQLite first. Supabase sync runs on reconnect. The app is fully functional without a network connection.

**IAP is subscription-only.** No one-time purchase paths remain. Subscription validation runs through a Supabase Edge Function that validates Apple receipts server-side and enforces lapse. Client re-verifies on launch (24h gate) using the stored receipt.

**Reanimated v4.** The mark reorder uses `useSharedValue` / `useAnimatedStyle` / `Gesture.Pan` — no third-party grid libraries. The `babel.config.js` must keep `react-native-reanimated/plugin` last.

---

## Production Build Checklist

Before building for the App Store:

- [ ] `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in `.env`
- [ ] EAS project ID configured in `app.json` (`eas init` if needed)
- [ ] Supabase RLS policies applied
- [ ] `validate-iap-receipt` Edge Function deployed and tested
- [ ] Edge function revocation path active (lapsed subscriptions → `pro_unlocked = false`)
- [ ] Apple Health entitlements configured in EAS credentials
- [ ] Push notification certificate configured

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

---

## License

MIT — Sierra Link LLC
