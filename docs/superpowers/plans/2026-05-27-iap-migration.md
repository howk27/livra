# IAP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-workstream IAP hardening: (A) client-side receipt re-verify on launch to enforce subscription lapse, (B) legacy one-time purchase audit and cleanup, (C) paywall UI copy refresh.

**Architecture:** New `lib/iap/iapReVerify.ts` encapsulates the silent re-verify flow (24h gate, receipt storage, lapse handling). `IapManager.ts` gains receipt persistence on successful purchase. `_layout.tsx` calls `reVerifyProOnLaunch()` once the user is initialized. `paywall.tsx` gets updated feature list and copy strings only — no purchase logic changes. The edge function itself must be updated via the Supabase dashboard (described in Workstream A but not a file in this repo).

**Tech Stack:** `AsyncStorage`, `validateReceiptWithServer` (already in `lib/iap/iap.ts`), `checkProStatus`, TypeScript strict.

---

## File Map

| Action | Path |
|--------|------|
| Create | `lib/iap/iapReVerify.ts` |
| Create | `tests/unit/iapReVerify.test.ts` |
| Modify | `lib/services/iap/IapManager.ts` (receipt storage only) |
| Modify | `app/_layout.tsx` (add launch re-verify call) |
| Modify | `app/paywall.tsx` (copy and feature list only) |

---

## Workstream A: Edge Function Audit Notes (Server-Side — No Repo Files)

These changes must be applied via the Supabase dashboard. They are documented here for reference only — do not edit any files in this repo for these items.

1. **Fix 1 (Critical): Add revocation path** — When Apple status=0 but `extractActiveEntitlement` returns null, flip `pro_unlocked` to false if currently true. Return `200 { unlocked: false, reason: 'subscription_lapsed' }`.

2. **Fix 2 (Critical): Handle status 21006** — Apple status 21006 = valid receipt, expired subscription. Currently returns 400. Should trigger revocation (same as Fix 1) and return `200 { unlocked: false, reason: 'subscription_expired' }`.

3. **Fix 3 (Recommended): Grace period** — Check `pending_renewal_info` before revoking. If `auto_renew_status === '1'`, keep pro_unlocked=true and return `{ unlocked: true, grace: true }`.

4. **Fix 4 (Recommended): Persist expiry** — Add `subscription_expires_at timestamptz` to `profiles`, update `update_pro_status` RPC signature to persist the value.

5. **Safety rule** — Only revoke when Apple confirms lapsed/expired (status 0 + no entitlement, or status 21006). Never revoke on network errors or Apple 5xx.

**After edge function changes:** client-side re-verify (this plan) will propagate revocations to the app on next launch.

---

## Workstream B: Legacy One-Time Purchase Audit

- [ ] **Step 1: Grep for legacy product patterns**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && grep -rn "lifetime\|one_time\|pro_once\|consumable\|getProducts\b" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".expo" | grep -v "__mocks__"
```

Expected: Likely zero matches (the codebase already uses `getSubscriptions`). If matches appear, read each file and assess.

- [ ] **Step 2: Grep for requestPurchase (non-subscription variant)**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && grep -rn "requestPurchase\b" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".expo"
```

Expected: Zero matches (subscription flow uses `requestSubscription`). If found, evaluate each call site.

- [ ] **Step 3: If any legacy paths found — evaluate and remove**

If any legacy IAP paths are found:
- If the code path has no active users (no corresponding product in App Store Connect): delete the code entirely.
- If existing users might restore a legacy purchase: replace with a log + no-op comment:
  ```typescript
  // Legacy one-time purchase tombstone — product discontinued 2026-05.
  // If a user attempts restore, log the event and no-op.
  logger.log('[IAP] Legacy one-time purchase restore attempted — no-op');
  ```

- [ ] **Step 4: Commit audit result**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add -p && git commit -m "chore(iap): legacy one-time purchase audit — no legacy paths found"
# (adjust message if removals were made)
```

---

## Workstream C: Client-Side Re-Verify on Launch

### Task 1: Write and pass unit tests for iapReVerify.ts

**Files:**
- Create: `tests/unit/iapReVerify.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/iapReVerify.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../lib/iap/iap', () => ({
  validateReceiptWithServer: jest.fn(),
  checkProStatus: jest.fn(),
}));

import {
  getStoredReceipt,
  storeReceipt,
  shouldReVerify,
  markVerified,
  IAP_RECEIPT_KEY,
  IAP_LAST_VERIFY_KEY,
} from '../../lib/iap/iapReVerify';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
});

describe('storeReceipt / getStoredReceipt', () => {
  it('persists and retrieves the receipt string', async () => {
    await storeReceipt('receipt-abc123');
    expect(await getStoredReceipt()).toBe('receipt-abc123');
  });

  it('returns null when nothing is stored', async () => {
    expect(await getStoredReceipt()).toBeNull();
  });

  it('uses the correct AsyncStorage key', async () => {
    await storeReceipt('r');
    expect(await AsyncStorage.getItem(IAP_RECEIPT_KEY)).toBe('r');
  });
});

describe('shouldReVerify', () => {
  it('returns true when no last-verify timestamp exists', async () => {
    expect(await shouldReVerify()).toBe(true);
  });

  it('returns false when verified less than 24 hours ago', async () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
    await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, recent);
    expect(await shouldReVerify()).toBe(false);
  });

  it('returns true when verified more than 24 hours ago', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, old);
    expect(await shouldReVerify()).toBe(true);
  });
});

describe('markVerified', () => {
  it('writes a timestamp to AsyncStorage', async () => {
    const before = Date.now();
    await markVerified();
    const stored = await AsyncStorage.getItem(IAP_LAST_VERIFY_KEY);
    expect(stored).not.toBeNull();
    const ts = new Date(stored!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/iapReVerify.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../../lib/iap/iapReVerify'`

---

### Task 2: Implement iapReVerify.ts

**Files:**
- Create: `lib/iap/iapReVerify.ts`

- [ ] **Step 1: Create the module**

```typescript
// lib/iap/iapReVerify.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { validateReceiptWithServer, checkProStatus } from './iap';

export const IAP_RECEIPT_KEY = '@livra_iap_receipt';
export const IAP_LAST_VERIFY_KEY = '@livra_iap_last_verify';

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function storeReceipt(receipt: string): Promise<void> {
  await AsyncStorage.setItem(IAP_RECEIPT_KEY, receipt);
}

export async function getStoredReceipt(): Promise<string | null> {
  return AsyncStorage.getItem(IAP_RECEIPT_KEY);
}

export async function shouldReVerify(): Promise<boolean> {
  const lastVerify = await AsyncStorage.getItem(IAP_LAST_VERIFY_KEY);
  if (!lastVerify) return true;
  const age = Date.now() - new Date(lastVerify).getTime();
  return age >= VERIFY_INTERVAL_MS;
}

export async function markVerified(): Promise<void> {
  await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, new Date().toISOString());
}

/**
 * Silently re-verifies the stored receipt with the edge function.
 * If the server reports the subscription is no longer active, clears the local
 * pro cache (forces a DB re-read on the next checkProStatus call).
 *
 * Fails open: any network or server error leaves pro status unchanged.
 * Only call this when the user is known to be pro (checkProStatus returned effectiveUnlocked=true).
 */
export async function reVerifyProOnLaunch(): Promise<void> {
  try {
    const needsVerify = await shouldReVerify();
    if (!needsVerify) {
      logger.log('[IAP] Re-verify skipped — checked within last 24h');
      return;
    }

    const receipt = await getStoredReceipt();
    if (!receipt) {
      logger.log('[IAP] Re-verify skipped — no stored receipt');
      return;
    }

    logger.log('[IAP] Silently re-verifying subscription receipt');
    const result = await validateReceiptWithServer({ platform: 'ios', receipt });

    if (result.status === 'invalid') {
      logger.log('[IAP] Re-verify: subscription lapsed — clearing local pro cache');
      await AsyncStorage.removeItem('pro_unlocked');
      // checkProStatus will re-read from DB on next call; DB was already updated by the edge function.
    } else if (result.status === 'valid') {
      logger.log('[IAP] Re-verify: subscription still active');
    } else {
      // transient — fail open, do not revoke
      logger.log('[IAP] Re-verify: transient error — leaving pro status unchanged', result.reason);
    }

    await markVerified();
  } catch (err) {
    logger.error('[IAP] Re-verify unexpected error — failing open', err);
  }
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/iapReVerify.test.ts --no-coverage 2>&1 | tail -15
```

Expected: `Tests: 8 passed`

- [ ] **Step 3: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/iap/iapReVerify.ts tests/unit/iapReVerify.test.ts && git commit -m "feat(iap): add iapReVerify module with 24h gate and unit tests"
```

---

### Task 3: Store receipt in IapManager on successful purchase

**Files:**
- Modify: `lib/services/iap/IapManager.ts`

- [ ] **Step 1: Add storeReceipt import at top of IapManager.ts**

Find the imports section of `lib/services/iap/IapManager.ts`. After the existing imports, add:

```typescript
import { storeReceipt } from '../iap/iapReVerify';
```

- [ ] **Step 2: Find the purchase update listener and add receipt storage**

In `IapManager.ts`, find the `purchaseUpdatedListener` callback (the function that processes a successful `Purchase` from react-native-iap). Look for the line that calls `validateReceiptWithServer` or processes `purchase.transactionReceipt`.

Add receipt storage immediately after a purchase is received and before validation:

```typescript
// Store the receipt for background re-verify on future launches
if (purchase.transactionReceipt) {
  storeReceipt(purchase.transactionReceipt).catch((err) => {
    logger.warn('[IapManager] Failed to store receipt for re-verify', err);
  });
}
```

Place this after: `const receipt = purchase.transactionReceipt;`
And before: the `validateReceiptWithServer` call.

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "IapManager" | head -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/services/iap/IapManager.ts && git commit -m "feat(iap): persist receipt to AsyncStorage on purchase for background re-verify"
```

---

### Task 4: Add launch re-verify call to _layout.tsx

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add import**

At the top of `app/_layout.tsx`, after the existing imports, add:

```typescript
import { checkProStatus } from '../lib/iap/iap';
import { reVerifyProOnLaunch } from '../lib/iap/iapReVerify';
```

- [ ] **Step 2: Add re-verify effect to RootLayout**

Inside `RootLayout`, after the existing `useEffect` hooks, add a new effect that fires once when the user is initialized and pro:

```typescript
  // Silently re-verify subscription receipt once per 24h on launch.
  // Only runs when the user is known to be pro — skips for free users.
  useEffect(() => {
    if (!initialized || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await checkProStatus();
        if (cancelled) return;
        if (status.effectiveUnlocked) {
          await reVerifyProOnLaunch();
        }
      } catch {
        // Fail open — never block app launch
      }
    })();
    return () => { cancelled = true; };
  }, [initialized, user?.id]);
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "_layout" | head -10
```

Expected: No errors.

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/_layout.tsx && git commit -m "feat(iap): add silent receipt re-verify on app launch for pro users"
```

---

## Workstream D: Paywall UI Refresh

### Task 5: Update paywall PRO_FEATURES list and copy

**Files:**
- Modify: `app/paywall.tsx`

- [ ] **Step 1: Replace the PRO_FEATURES constant**

Find in `app/paywall.tsx` (around line 38):
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

Replace with:
```typescript
const PRO_FEATURES = [
  { ion: 'flag-outline',           title: 'Unlimited Goals',      description: 'Queue as many goals as you have.' },
  { ion: 'infinite-outline',       title: 'Unlimited Marks',      description: 'No ceiling on what you can build.' },
  { ion: 'swap-vertical-outline',  title: 'Mark Reordering',      description: 'Put your most important marks first.' },
  { ion: 'heart-outline',          title: 'Health Integrations',  description: 'Sleep, Workout, Steps — synced automatically.' },
  { ion: 'notifications-outline',  title: 'Custom Reminders',     description: 'Daily reminders for any mark, any time.' },
  { ion: 'bar-chart-outline',      title: 'CSV Export',           description: 'Your history is yours. Export anytime.' },
];
```

- [ ] **Step 2: Replace SHIPPED_PREMIUM_FEATURE_TITLES**

Find (around line 56):
```typescript
const SHIPPED_PREMIUM_FEATURE_TITLES = ['Unlimited Goals', 'Unlimited Marks', 'CSV Export'];
```

Replace with:
```typescript
const SHIPPED_PREMIUM_FEATURE_TITLES = [
  'Unlimited Goals',
  'Unlimited Marks',
  'Mark Reordering',
  'Health Integrations',
  'Custom Reminders',
  'CSV Export',
];
```

- [ ] **Step 3: Update headline, subhead, and CTA copy**

Search the paywall render for the headline text. Find and replace:
- Headline: find the text `"Everything you need"` or similar → replace with `"Everything you need to finish what you start."`
- Subhead: find `"Livra+"` description line → replace with `"Livra+ unlocks the full system."`
- CTA button label: find `"Start Free Trial"` or `"Subscribe"` or similar → replace with `"Start Livra+"`

To locate these strings:
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && grep -n "Start\|Unlock\|Subscribe\|headline\|subhead\|Livra+" app/paywall.tsx | head -20
```

Update only the string values — do not change any surrounding component structure or logic.

- [ ] **Step 4: Update monthly/yearly pricing copy if present**

Search for pricing display strings:
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && grep -n "month\|year\|Save\|4.99\|per month" app/paywall.tsx | head -15
```

If hardcoded pricing strings exist:
- Monthly: ensure displayed as `"$4.99 / month"`
- Yearly: if a savings badge is displayed, ensure it calculates correctly from product price

Do not change any `MONTHLY_PRODUCT_ID`, `YEARLY_PRODUCT_ID`, or purchase call sites.

- [ ] **Step 5: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "paywall" | head -10
```

Expected: No errors.

- [ ] **Step 6: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/paywall.tsx && git commit -m "feat(paywall): refresh PRO_FEATURES list and copy for v2 feature set"
```

---

### Task 6: Final type-check and test run

- [ ] **Step 1: Full type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | head -30
```

Expected: Zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -15
```

Expected: All tests pass; 8 new iapReVerify tests pass.
