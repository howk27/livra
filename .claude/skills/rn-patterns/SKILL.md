---
name: rn-patterns
description: >
  Applies React Native + Expo conventions for this codebase.
  Use when writing any new screen, component, or navigation logic.
user-invocable: false
---

## React Native conventions for Livra

State: Always use Zustand slices. Never useState for data that persists.
Persistence: AsyncStorage via Zustand middleware only — no direct calls.
Navigation: [your navigation library] — match existing patterns in src/navigation/
Styling: StyleSheet.create() only — no inline styles except for dynamic values.
Empty states: Every list screen must handle the empty case with a meaningful component.
Loading states: Every async operation needs a loading indicator.
Dark mode: Use color tokens from src/constants/colors.ts — never hardcode hex values.

## File structure
- Screens → src/screens/[ScreenName]/index.tsx
- Components → src/components/[ComponentName]/index.tsx
- Zustand stores → src/stores/[storeName].ts
- Constants → src/constants/

## Testing
Write tests before implementing. Use [your test framework].
Test file lives next to the component: ComponentName.test.tsx