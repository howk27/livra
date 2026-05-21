## Project

Livra — habit/mark tracking mobile app. React Native + Expo. State: Zustand + AsyncStorage. Goal: production App Store + Play Store. Visual identity: dark green, established — do not redesign.

Architecture: `app/` file-based routes (expo-router). Root `app/_layout.tsx`: `Stack` + providers (`QueryClientProvider`, gesture root, notifications, dev/experiments). Main UX under `app/(tabs)/` (`Tabs`: home, tracking, settings; `stats` tab hidden). Modals/stack screens: `counter/[id]`, `onboarding`, `paywall`, `auth`, `iap-dashboard`. Business logic in `lib/` (SQLite `expo-sqlite`, sync, Supabase client), `hooks/`, `services/`, `state/*Slice.ts`, `components/`, `theme/` (`colors`, `tokens`).

## Stack

Expo SDK ~54, `expo-router` ~6, React 19, React Native 0.81. Zustand, `@react-native-async-storage/async-storage`, `@tanstack/react-query`, `@supabase/supabase-js`, `expo-sqlite`, `react-native-paper`, `react-native-reanimated` 4.x + `react-native-worklets`, `react-native-gesture-handler`, `react-native-iap`, `date-fns`, `uuid`. TypeScript 5.9 (strict), path alias `@/*` → repo root (`tsconfig` + `babel-plugin-module-resolver`). ESLint: `eslint-config-expo` + Prettier. EAS: `eas.json` profiles `development` / `preview` / `production`.

## Commands

`npm run start` — Expo dev. `npm run android` / `npm run ios` / `npm run web` — run targets. `npm run test` — Jest (`jest-expo` preset, `jest.setup.js`). `npm run lint`, `npm run format`, `npm run type-check`. Store builds: `npm run build:ios` / `build:android` (production EAS); preview: `build:preview:*`. Submit: `submit:ios` / `submit:android`.

## Conventions

Always write tests before shipping a feature. Zustand slices only — never useState for persistent data. All screens must handle empty, loading, and error states. Color tokens from constants only — never hardcode hex values (`theme/colors`, `theme/tokens`). No inline styles except for dynamic values; otherwise `StyleSheet.create` / composed styles.

Import `react-native-get-random-values` before any `uuid` (root `app/_layout.tsx`). New routes: match `app/` groups and `Stack.Screen` / `Tabs.Screen` patterns. Tests: `tests/unit/*.test.ts`. Reanimated: `react-native-reanimated/plugin` last in `babel.config.js`.

## Key Docs

@docs/architecture.md  
@docs/product-context.md  
@docs/roadmap.md
