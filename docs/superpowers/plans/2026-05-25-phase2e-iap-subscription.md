# Phase 2E — IAP Subscription Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the subscription purchase flow is correct, add grandfathering for any user already marked `pro_unlocked = true` in the DB, update the paywall feature list to include Phase 2 features (Goals), and add a "Manage Subscription" button in Settings.

**Architecture:** The subscription SKUs (`livra_plus_monthly`, `livra_plus_yearly`) and receipt validation flow already exist. The only code changes are: (1) update `PRO_FEATURES` in `paywall.tsx` to reflect the Phase 2 feature set, (2) add free-tier mark and goal limit enforcement using the `canAddMark` / `canAddGoal` gates added in Phase 2A's `lib/gating.ts`, (3) add a "Manage Subscription" button in Settings that deep-links to Apple's subscription management page, (4) verify the paywall is not shown to users who are already `pro_unlocked` (grandfathering).

**Tech Stack:** React Native / Expo, TypeScript, `react-native-iap`, `Linking`, Jest.

**Prerequisite:** Phase 2A must be complete — this plan requires `lib/gating.ts` with `canAddMark` / `canAddGoal`.

**Execute in isolation:** Make no other feature changes in the same PR as this plan.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/paywall.tsx` | Modify | Update PRO_FEATURES list, verify grandfathering guard |
| `app/(tabs)/settings.tsx` | Modify | Add "Manage Subscription" button |
| `hooks/useCounters.ts` | Modify | Enforce `canAddMark` free-tier limit on new mark creation |
| `tests/unit/gating.test.ts` | Create | Unit tests for canAddGoal and canAddMark |

**Do not touch:** `lib/iap/iap.ts`, `lib/iap/skus.ts`, `hooks/useIapSubscriptions.ts`, `lib/services/iap/` — the purchase and validation flow is already correct.

---

## Task 1: Gating unit tests

**Files:**
- Create: `tests/unit/gating.test.ts`

- [ ] **Step 1: Create `tests/unit/gating.test.ts`**

```typescript
import { canAddGoal, canAddMark, FREE_GOAL_LIMIT, FREE_MARK_LIMIT } from '../../lib/gating';

describe('FREE limits', () => {
  test('FREE_GOAL_LIMIT is 3', () => {
    expect(FREE_GOAL_LIMIT).toBe(3);
  });
  test('FREE_MARK_LIMIT is 3', () => {
    expect(FREE_MARK_LIMIT).toBe(3);
  });
});

describe('canAddGoal', () => {
  test('free user under limit', () => expect(canAddGoal(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddGoal(false, 3)).toBe(false));
  test('pro user unlimited', () => expect(canAddGoal(true, 100)).toBe(true));
});

describe('canAddMark', () => {
  test('free user under limit', () => expect(canAddMark(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddMark(false, 3)).toBe(false));
  test('pro user unlimited', () => expect(canAddMark(true, 100)).toBe(true));
});
```

- [ ] **Step 2: Run tests — expect pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/gating.test.ts
```

Expected: all 7 tests PASS (gating.ts was set up in Phase 2A).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/gating.test.ts
git commit -m "$(cat <<'EOF'
test(phase2e): add unit tests for free-tier gating limits

Verifies FREE_GOAL_LIMIT=3 and FREE_MARK_LIMIT=3, and that canAddGoal/
canAddMark enforce the correct boundaries for free and pro users.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update paywall PRO_FEATURES

**Files:**
- Modify: `app/paywall.tsx`

- [ ] **Step 1: Find the `PRO_FEATURES` constant in `app/paywall.tsx`**

It's near the top of the file (~line 38). The Phase 1 copy rewrite updated the descriptions. Now update the list to include the Phase 2 features:

**Old (after Phase 1):**
```typescript
const PRO_FEATURES = [
  {
    ion: 'infinite-outline',
    title: 'Unlimited Marks',
    description: 'Every mark, every goal. No ceiling on what you can build.',
  },
  {
    ion: 'bar-chart-outline',
    title: 'CSV Export',
    description: 'Your history is yours. Export it whenever you want.',
  },
];
```

**New:**
```typescript
const PRO_FEATURES = [
  {
    ion: 'flag-outline',
    title: 'Unlimited Goals',
    description: 'Queue as many goals as you have. Work through them one at a time.',
  },
  {
    ion: 'infinite-outline',
    title: 'Unlimited Marks',
    description: 'Every daily action, tracked. No ceiling on what you can build.',
  },
  {
    ion: 'bar-chart-outline',
    title: 'CSV Export',
    description: 'Your history is yours. Export it whenever you want.',
  },
];
```

Also update `SHIPPED_PREMIUM_FEATURE_TITLES` (also near the top of the file) to include the new feature:

**Old:**
```typescript
const SHIPPED_PREMIUM_FEATURE_TITLES = ['Unlimited Marks', 'CSV Export'];
```

**New:**
```typescript
const SHIPPED_PREMIUM_FEATURE_TITLES = ['Unlimited Goals', 'Unlimited Marks', 'CSV Export'];
```

- [ ] **Step 2: Verify the grandfathering guard in `app/paywall.tsx`**

The paywall should not be shown to users who already have `pro_unlocked = true` in the DB (grandfathered one-time purchase users). The existing `checkProStatus()` call handles this — verify the paywall screen uses `effectiveUnlocked` from the pro status check to skip the paywall for existing pro users.

Search `app/paywall.tsx` for the pro status check. It will look something like:

```typescript
const proStatus = await checkProStatus();
if (proStatus.effectiveUnlocked) {
  router.back(); // or router.replace('/(tabs)/home')
  return;
}
```

If this guard does NOT exist, add it in the `useFocusEffect` or initial `useEffect` that runs when the screen mounts:

```typescript
useFocusEffect(
  useCallback(() => {
    const checkPro = async () => {
      const status = await checkProStatus();
      if (status.effectiveUnlocked) {
        router.back();
      }
    };
    void checkPro();
  }, [router])
);
```

If it already exists with `effectiveUnlocked`, no change needed — just confirm and document it.

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/paywall.tsx
git commit -m "$(cat <<'EOF'
feat(phase2e): update paywall feature list for Phase 2 + verify grandfathering

Adds 'Unlimited Goals' as first PRO_FEATURE (Phase 2 ships this).
Grandfathering guard: users with effectiveUnlocked=true skip the paywall.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Manage Subscription in Settings

**Files:**
- Modify: `app/(tabs)/settings.tsx`

- [ ] **Step 1: Find the settings screen structure**

Open `app/(tabs)/settings.tsx`. Find the section that contains IAP-related items (likely "Restore Purchases" or a subscription section). We'll add a "Manage subscription" row that deep-links to Apple's subscription management.

- [ ] **Step 2: Add the "Manage subscription" button**

Find the `Linking` import in `settings.tsx` (if it exists). If not, add:

```typescript
import { Linking } from 'react-native';
```

Add a handler function in the component:

```typescript
const handleManageSubscription = async () => {
  const url = Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  await Linking.openURL(url);
};
```

Find the section where "Restore Purchases" is rendered. Add a new row directly above or below it:

```tsx
<TouchableOpacity
  style={[styles.settingsRow, { borderColor: themeColors.border }]}
  onPress={handleManageSubscription}
>
  <Text style={[styles.settingsRowText, { color: themeColors.text }]}>
    Manage subscription
  </Text>
  <Ionicons name="open-outline" size={16} color={themeColors.textSecondary} />
</TouchableOpacity>
```

Use whatever `styles.settingsRow` and `styles.settingsRowText` styles already exist in the file — match the visual pattern of the surrounding rows exactly.

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "$(cat <<'EOF'
feat(phase2e): add Manage Subscription button to Settings

Deep-links to Apple subscriptions management page (iOS) or Google Play
subscriptions (Android) so users can cancel or modify their subscription.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Enforce mark limit for free users

**Files:**
- Modify: `hooks/useCounters.ts`

The free tier allows up to 3 marks. Currently there is no enforcement. We need to check `canAddMark` before adding a mark.

- [ ] **Step 1: Find the `addCounter` / `addMark` call in `hooks/useCounters.ts`**

Open `hooks/useCounters.ts`. Find where `addMark` (or `addCounter`) from `useMarksStore` is called. This is typically exposed as `addCounter` through the hook.

- [ ] **Step 2: Read the full `hooks/useCounters.ts` file**

Before editing, read the file to understand its current shape — specifically how `addCounter` is wrapped and what parameters it takes.

- [ ] **Step 3: Add the mark limit check**

Find the function in `useCounters.ts` that calls `useMarksStore.getState().addMark(...)` or equivalent. Wrap it with a limit check:

```typescript
import { canAddMark } from '../lib/gating';
import { checkProStatus } from '../lib/iap/iap';

// Inside the addCounter wrapper:
const currentMarkCount = useMarksStore.getState().marks.length;
const proStatus = await checkProStatus();
if (!canAddMark(proStatus.effectiveUnlocked, currentMarkCount)) {
  throw new Error('FREE_MARK_LIMIT');
}
```

The calling screen (`app/counter/new.tsx` or similar) should already handle errors — if it shows a generic error, update it to show a paywall prompt when `error.message === 'FREE_MARK_LIMIT'`:

```typescript
} catch (err: any) {
  if (err?.message === 'FREE_MARK_LIMIT') {
    Alert.alert(
      'Mark limit reached',
      'The free plan supports up to 3 marks. Upgrade to Livra+ for unlimited.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/paywall') },
      ],
    );
  } else {
    // existing error handling
  }
}
```

Find the calling screen by searching for `addCounter` or `addMark` calls across the app screens.

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/useCounters.ts
git commit -m "$(cat <<'EOF'
feat(phase2e): enforce free-tier mark limit (max 3 marks)

Free users attempting to add a 4th mark now see a paywall alert.
canAddMark checks effectiveUnlocked so grandfathered and active
subscribers are never blocked.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Monthly subscription at $4.99/mo | SKUs already correct; price shown by App Store |
| Free tier: up to 3 marks | Task 4 canAddMark enforcement |
| Free tier: up to 3 goals | Enforced by GoalLimitError in Phase 2A |
| Pro: unlimited goals + marks | canAddGoal(true, n) = true always |
| Grandfather existing pro users | Task 2: effectiveUnlocked guard on paywall mount |
| Subscription management | Task 3: Manage Subscription deep link |
| PRO_FEATURES list current | Task 2: Unlimited Goals added |
| App Store listing does NOT update until Phase 2 ships | Out of scope for code changes — handled as a release step |

### Execute in isolation
This plan touches: `paywall.tsx`, `settings.tsx`, `hooks/useCounters.ts`, `tests/unit/gating.test.ts`. No other features are modified. Ship this as its own PR after Phases 2A–2D are merged.

### Placeholder scan
Task 3 Step 2 says "match the visual pattern of the surrounding rows exactly" — this is an instruction to the implementer to read the file first, not a placeholder in the code. All code that can be specified is specified.

### Type consistency
- `canAddMark(isPro, count)` — matches signature in `lib/gating.ts` ✓
- `effectiveUnlocked` from `checkProStatus()` return type — field exists on `ProStatusResult` ✓
- `FREE_MARK_LIMIT` exported from `lib/gating.ts` — used in tests ✓
