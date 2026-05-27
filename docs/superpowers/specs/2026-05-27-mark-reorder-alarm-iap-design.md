# Livra — Three-Feature Design Spec
**Date:** 2026-05-27  
**Features:** Mark Reorder (Reanimated v4) · Daily Reminders + Sleep Alarm · IAP Subscription Migration  
**Execution order:** Reorder → Alarm/Reminder → IAP (Edge Function first, then paywall + legacy cleanup)

---

## 1. Mark Reorder (Reanimated v4)

### Goal
Replace the existing `react-native-draggable-grid` implementation in the home screen edit mode with a custom reanimated v4 + gesture handler drag-and-drop. The UX stays the same (edit mode toggle, list of rows with drag handles), the internals improve.

### Not gated
Mark reorder is a basic feature available to all users — no Livra+ gate.

### New files
- `components/SortableMarkList.tsx` — manages shared values, renders rows
- `components/SortableMarkRow.tsx` — individual draggable row with pan gesture

### Removed
- `import { DraggableGrid }` from `home.tsx`
- Auto-scroll interval logic (~80 lines) replaced with a simpler edge-detection approach

### Architecture

**Shared values (in SortableMarkList):**
```
positions: SharedValue<number[]>  — positions[dataIndex] = current display order (0 = top)
activeIndex: SharedValue<number>  — data index of the item being dragged (-1 = none)
dragY: SharedValue<number>        — finger Y translation during active drag
startY: SharedValue<number>       — Y baseline of dragged item at gesture start
```

**Item height constant:**
```
ITEM_HEIGHT = EDIT_ROW_HEIGHT + EDIT_ROW_GAP  (58 + spacing.xs)
```

**Per-row animated style:**
```
if (i === activeIndex):
  translateY = startY + dragY − (i × ITEM_HEIGHT)   // follows finger
  zIndex = 100, scale = 1.02, shadow elevated

else:
  translateY = withSpring((positions[i] − i) × ITEM_HEIGHT)
  zIndex = 1
```

**Gesture (on drag handle only):**
- `Gesture.Pan()` attached to the `reorder-two-outline` icon via `GestureDetector`
- `.onStart`: capture startY, set activeIndex
- `.onUpdate`: update dragY; recalculate which display slot the dragged item occupies; swap positions array entries with `withSpring`
- `.onEnd`: `runOnJS(onReorder)(newOrderArray)` → existing `persistReorderedCounters`

**Auto-scroll:**
Simplified: during active drag, check `dragY` relative to viewport bounds. When within 80px of top or bottom edge, call `scrollViewRef.current.scrollTo()` via `runOnJS`. No interval polling.

**Container layout:**
The `SortableMarkList` wrapper has an explicit `height = marks.length × ITEM_HEIGHT` so all items can overlap/translate without the container collapsing.

### Home screen changes
- Remove `DraggableGrid` import and usage
- Remove `gridData`, `renderGridItem`, auto-scroll refs and interval logic
- Add `<SortableMarkList marks={localCounters} onReorder={persistReorderedCounters} scrollViewRef={scrollViewRef} />`
- Edit mode toggle, delete handlers, row appearance all stay the same

### Tests
- Unit: order swap logic (isolated from UI)
- Manual: drag with 1, 3, 5+ marks; fast drags; edge drag-and-scroll; cancel mid-drag

---

## 2. Daily Reminders + Sleep Alarm

### Goal
1. Any mark can have a daily push notification reminder at a user-set time
2. Sleep marks additionally get a "Set Wake-Up Alarm →" button that deep-links to the iOS Clock app

### New file
`lib/notifications/markReminder.ts` — generalizes the existing sleep notification pattern:

```ts
// AsyncStorage key: '@livra_reminder_time:{markId}'
getMarkReminderTime(markId): Promise<string | null>
setMarkReminderTime(markId, hhmm): Promise<void>
clearMarkReminderTime(markId): Promise<void>
scheduleMarkReminder(markId, markName, hhmm): Promise<void>
cancelMarkReminder(markId): Promise<void>
```

Notification content: `"Time to check in on [Mark Name]."` with `data: { screen: 'checkin', markId }`.  
Notification ID: `livra-reminder-{markId}`.

### sleepNotification.ts migration
Becomes a thin wrapper — its `scheduleSleepNotification` delegates to `markReminder.scheduleMarkReminder`. Existing callers unchanged.

### UI — mark detail screen (`counter/[id].tsx`)

New **"Daily Reminder"** section rendered for all marks, below the HealthKit section:

```
┌─────────────────────────────────────┐
│ 🔔 Daily Reminder       [toggle ON] │
│ 8:00 AM          [time picker →]    │  ← visible only when toggle is ON
└─────────────────────────────────────┘
```

- Toggle on: load saved time (or default 8:00 AM), schedule notification, show time picker
- Toggle off: cancel scheduled notification, clear stored time
- Time picker: `@react-native-community/datetimepicker` (v9.1.0, already installed) in `time` mode
- On unmount with unsaved changes: auto-save (no explicit Save button needed)

**Sleep marks only — additional section:**

```
┌─────────────────────────────────────┐
│ ⏰ Wake-Up Alarm                    │
│ Set your alarm in the Clock app.    │
│ [Open Clock App →]                  │
└─────────────────────────────────────┘
```

Button calls `Linking.openURL('clock:')`.

### Reminder cancellation
- On mark delete: `cancelMarkReminder(markId)` added to `deleteMark` flow in `countersSlice.ts`

### Tests
- Unit: `markReminder.ts` — schedule, cancel, time key storage
- Unit: sleep notification wrapper still works
- Manual: set reminder on a mark, verify notification fires; delete mark, verify no notification

---

## 3. IAP Subscription Migration

**Execution order: Edge Function audit → Legacy cleanup → Paywall UI refresh**

### Workstream A: Edge function update + subscription lapse enforcement (do first)

**What exists (`docs/Validate-iap-receipt.md` — gitignored, never commit):**  
The edge function is a **receipt validation endpoint** — the client calls it after a purchase to unlock pro. It is NOT an Apple Server Notification (S2S webhook) handler.

**What's correct (do not change):**
- Receipt validated with Apple prod → sandbox fallback on status `21007` ✓
- `ALLOWED_PRODUCT_IDS` matches client SKUs (`livra_plus_monthly`, `livra_plus_yearly`) ✓
- `extractActiveEntitlement` checks `expiresDateMs > nowMs` and filters cancelled transactions ✓
- Uses `APPLE_SHARED_SECRET` (required for auto-renewable subscriptions) ✓
- `SECURITY DEFINER` RPC `update_pro_status` for safe DB write ✓
- Android returns `501` cleanly ✓

---

**Required edge function changes:**

**🔴 Fix 1 — Add revocation path (critical)**

`update_pro_status` is only ever called with `pro_unlocked_param = true`. A cancelled or expired subscription never triggers a revocation. Fix: when the receipt is valid (Apple status 0) but `extractActiveEntitlement` returns `null`, check if the user currently has `pro_unlocked = true` and flip it to `false`.

```
// After extractActiveEntitlement returns null:
const { data: profile } = await supabase
  .from('profiles')
  .select('pro_unlocked')
  .eq('id', userId)
  .single();

if (profile?.pro_unlocked) {
  await supabase.rpc('update_pro_status', {
    user_id_param: userId,
    pro_unlocked_param: false,
    receipt_id_param: '',
  });
}
return json(200, { success: true, unlocked: false, reason: 'subscription_lapsed' });
```

Return `200` (not `400`) — the receipt was valid, the subscription is just no longer active. The client uses the `unlocked: false` field to update local state.

**🔴 Fix 2 — Handle Apple status 21006 correctly (critical)**

Status `21006` means "receipt is valid but subscription has expired." Current code returns `400 { error: "Invalid receipt" }` — misleading and wrong. This should also trigger revocation, same as Fix 1.

```
if (appleResponse.status === 21006) {
  // Revoke if currently unlocked, same logic as Fix 1
  // Return 200 { unlocked: false, reason: 'subscription_expired' }
}
```

**🟡 Fix 3 — Respect Apple billing grace period (recommended)**

`pending_renewal_info` is typed but never read. Apple retries billing for up to 16 days — during this window access should NOT be revoked. Check before revoking:

```
const isInGracePeriod = (appleResponse.pending_renewal_info ?? []).some(
  (r) => ALLOWED_PRODUCT_IDS.has(r.product_id ?? '') && r.auto_renew_status === '1'
);
if (isInGracePeriod) {
  // Keep pro_unlocked = true, return { unlocked: true, grace: true }
}
```

**🟡 Fix 4 — Store subscription expiry date (recommended)**

The function returns `expiresDateMs` but never persists it. Add `subscription_expires_at` to the `update_pro_status` RPC so the DB knows when the subscription is due. This allows a cheap on-launch check without calling Apple every time.

Requires a Supabase migration: add `subscription_expires_at timestamptz` to `profiles`, update `update_pro_status` RPC signature.

---

**Safety rule — never revoke on Apple API errors:**

Only call `update_pro_status(false)` when Apple returns a confirmed lapsed/expired state (status 0 with no active entitlement, or status 21006). A network error, Apple 500, or missing `APPLE_SHARED_SECRET` must never trigger a revocation — fail open, not closed.

---

**Client-side: re-verify on app launch**

After the edge function is updated, wire the client:

1. On app launch, after `checkProStatus` returns `unlocked: true`, silently re-call the validation endpoint with the stored receipt (AsyncStorage key: `@livra_iap_receipt`).
2. Store the receipt in AsyncStorage when `IapManager` processes a successful purchase (in the `purchaseUpdatedListener`).
3. Gate re-verify to once per 24 hours (AsyncStorage timestamp `@livra_iap_last_verify`).
4. If response is `{ unlocked: false }`, call `refreshProStatus()` from the hook to re-read from DB.

Changes touch: edge function (Supabase dashboard), `lib/services/iap/IapManager.ts` (receipt storage only — no purchase flow changes), `lib/iap/iap.ts` (re-verify helper), `app/_layout.tsx` (launch trigger).

**Do not touch `useIapSubscriptions.ts`, `rniapAdapter.ts`, or any purchase call sites.**

---

**Note on Apple API deprecation:**

`verifyReceipt` is deprecated in favour of the App Store Server API (StoreKit 2). It still works and Apple has not announced a shutdown date. Acceptable for v1. Flag for v2 migration.

### Workstream B: Legacy one-time purchase audit

Search codebase for:
- Non-subscription product ID patterns (grep for `lifetime`, `one_time`, `pro_once`, `consumable`)
- `requestPurchase` calls (non-subscription variant from react-native-iap)
- Any `getProducts` call (vs `getSubscriptions`)

For any legacy path found:
- If it has no active users: remove safely
- If existing users might restore it: log the event and no-op (do not repurchase)
- Add a comment explaining the tombstone

### Workstream C: Paywall UI refresh (do last)

Update `app/paywall.tsx`:

**PRO_FEATURES list** (replace current):
```ts
const PRO_FEATURES = [
  { ion: 'flag-outline',      title: 'Unlimited Goals',    description: 'Queue as many goals as you have.' },
  { ion: 'infinite-outline',  title: 'Unlimited Marks',    description: 'No ceiling on what you can build.' },
  { ion: 'swap-vertical-outline', title: 'Mark Reordering', description: 'Put your most important marks first.' },
  { ion: 'heart-outline',     title: 'Health Integrations', description: 'Sleep, Workout, Steps — synced automatically.' },
  { ion: 'notifications-outline', title: 'Custom Reminders', description: 'Daily reminders for any mark, any time.' },
  { ion: 'bar-chart-outline', title: 'CSV Export',          description: 'Your history is yours. Export anytime.' },
];
```

**Pricing copy:**
- Monthly: "$4.99 / month"
- Yearly: show calculated monthly equivalent + "Save X%" badge
- Keep `SHIPPED_PREMIUM_FEATURE_TITLES` — only display features actually live at release

**Voice/copy:**
- Headline: "Everything you need to finish what you start."
- Subhead: "Livra+ unlocks the full system."
- CTA: "Start Livra+"

**Constraint:** Do not change any IAP call sites, product IDs, or purchase flow logic. Paywall changes are copy and layout only.

---

## Execution Order

1. **Mark Reorder** — self-contained, no dependencies
2. **Daily Reminders + Sleep Alarm** — self-contained
3. **IAP** in this order:
   a. Edge Function audit (server-side, isolated)
   b. Legacy cleanup (read-only audit → targeted removals)
   c. Paywall UI refresh (copy and layout only)
