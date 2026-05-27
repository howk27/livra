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

### Workstream A: Edge Function audit (do first)

Read the existing Supabase Edge Function (path to be located during implementation).

Confirm it handles all critical Apple Server Notification event types:

| Event | Expected action |
|---|---|
| `INITIAL_BUY` | Set `profiles.pro_unlocked = true` |
| `DID_RENEW` | Keep `profiles.pro_unlocked = true` |
| `CANCEL` | Set `profiles.pro_unlocked = false` |
| `REFUND` | Set `profiles.pro_unlocked = false` |
| `DID_CHANGE_RENEWAL_STATUS` (autoRenewStatus=0) | Schedule expiry or set false |
| `DID_FAIL_TO_RENEW` | Optionally set grace period |

If any event is missing or handled incorrectly, add/fix it.  
**Do not touch `IapManager.ts`, `useIapSubscriptions.ts`, or `rniapAdapter.ts` unless the audit finds a direct bug there.**

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
