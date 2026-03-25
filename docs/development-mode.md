# Development Mode (Livra)

This document explains how Livra’s environment system and dev utilities work,
and how to safely seed or reset data without leaking to production builds.

## Environments

Environment state is centralized in `lib/env.ts`. Use this module everywhere.

Exports:
- `env.isDev`
- `env.isPreview`
- `env.isProduction`
- `env.enableDiagnosticsByDefault` (true in dev)
- `env.allowMockData` (true in dev)

How it resolves:
- Reads `EXPO_PUBLIC_ENV` or Expo `extra.env` when present
- Falls back to runtime detection from `__DEV__`
- Treats `preview` as non-production

## Safety Rules

- No scattered `__DEV__` checks: only use `env.*`.
- Production builds should not emit console logs (logger is disabled).
- Dev utilities throw when called outside dev or an unlocked diagnostic state.
- Database dev tools are gated the same way.

## Dev Utilities

Folder: `lib/dev/`

Available helpers:
- `logger.ts` – console wrapper, disabled in production
- `mockDelay.ts` – simulate latency in dev
- `seedDemoData.ts` – generate realistic demo counters, events, streaks
- `resetApp.ts` – wipe local storage + DB (best effort SecureStore cleanup)

## Database Dev Tools

File: `lib/db/devTools.ts`

Functions:
- `clearAllData()` – clears local database state
- `seedHighUsage()` – heavy usage pattern with lots of events
- `seedBrokenStreak()` – scenario with a broken streak
- `seedPerfectWeek()` – perfect 7‑day streak scenario

These run only in dev or when diagnostics are explicitly unlocked.

## Diagnostics Unlock Flow

`DevToolsProvider` initializes diagnostics based on `env.enableDiagnosticsByDefault`
and listens for a future unlock signal via:
- `DeviceEventEmitter` event: `livra:diagnostics-unlock`

This prepares the app for a controlled unlock mechanism without shipping any UI.

## Typical Workflow (Dev)

1. Run the app in dev or preview.
2. Call seed helpers from a debug action or console:
   - `seedDemoData()`, `seedHighUsage()`, etc.
3. Use Weekly Review demo seeds from Diagnostics:
   - Balanced, Perfect, Midweek Dip, Strong Finish, Chaotic
4. Use `resetApp()` to clear local state and start fresh.

## Windows + Expo Dev Client

No iOS‑only tooling is required. The dev utilities are platform‑safe and can be
invoked on Windows through the Expo dev client or Metro console.
