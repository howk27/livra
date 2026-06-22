# Coherence + Robustness Fixes (Phase 3.1, batch 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the unambiguous P0/P1 defects from the 3.1 audit: a broken navigation CTA, a no-op share button on the live completion overlay, missing Home loading/error/failure feedback, an empty Android date picker, and misleading privacy toggles.

**Architecture:** Each fix is an isolated screen/component change touching one file (plus a test). No shared state or sequential dependency between tasks — they can execute in any order. Verification follows the spec's policy: testable logic gets a failing test first (TDD); pure-visual restructures are verified by read + `npm run type-check` + `npm run lint`.

**Tech Stack:** React Native 0.81, Expo SDK ~54, expo-router ~6, Zustand, Jest (`jest-expo`), TypeScript 5.9 strict.

## Global Constraints

- Color tokens from `theme/colors` / `theme/tokens` only — never hardcode hex (existing `'#FFFFFF'` literals in touched files are pre-existing; do not add new ones).
- No inline styles except dynamic values; otherwise `StyleSheet.create`.
- Voice & Copy: no guilt, no fake urgency, no streak-loss language (`PRODUCT.md` Launch Readiness).
- Tests live in `tests/unit/*.test.ts(x)`. Run with `npm run test`.
- Full Jest suite must stay green after each task; `npm run type-check` and `npm run lint` must not regress.
- **Out of scope (do NOT touch):** P1-1 notification engines (separate brainstorm), P1-6 expired-goal closure (held for 3.2), all P2 items including deleting `app/goal/complete.tsx`.

---

### Task 1: P0-1 — Fix broken "Add a mark" route in goal detail

**Files:**
- Modify: `app/goal/[id].tsx:227`
- Test: `tests/unit/deadRouteGuard.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (behavioral route correction).

Context: the empty-state CTA pushes to `/counter/new`, which does not exist (counter→mark rename). The live route is `app/mark/new.tsx`, which already reads a `goalId` param (`app/mark/new.tsx:104`). The fix is the route string; the param key (`goalId`) stays. The test is a static guard that fails while any dead `/counter/` route reference exists under `app/`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/deadRouteGuard.test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('no dead /counter/ route references', () => {
  it('app/ contains no navigation to the retired /counter/ routes', () => {
    const appDir = join(__dirname, '..', '..', 'app');
    const offenders: string[] = [];
    for (const file of walk(appDir)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const src = readFileSync(file, 'utf8');
      // pathname or href string pointing at the retired counter routes
      if (/['"`]\/counter\//.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- deadRouteGuard`
Expected: FAIL — offenders contains `app/goal/[id].tsx`.

- [ ] **Step 3: Fix the route**

In `app/goal/[id].tsx:227`, change the `onPress`:

```tsx
onPress={() => router.push({ pathname: '/mark/new', params: { goalId: id } } as any)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- deadRouteGuard`
Expected: PASS — offenders is empty.

- [ ] **Step 5: Commit**

```bash
git add app/goal/[id].tsx tests/unit/deadRouteGuard.test.ts
git commit -m "fix(3.1): route empty-goal 'Add a mark' to /mark/new (was dead /counter/new)"
```

---

### Task 2: P1-3 — Home screen loading/error states + surface log failures

**Files:**
- Modify: `app/(tabs)/focus.tsx` (imports; `handleQuickIncrement` ~232-250; render ~367-535)
- Test: none (verified by read + type-check + lint per spec; the increment-failure path mirrors the already-shipped `mark/[id]/index.tsx` Alert pattern)

**Interfaces:**
- Consumes: `useCounters()` already returns `{ counters, loading, error, incrementCounter, deleteCounter }` (`hooks/useCounters.ts:672-684`). `useNotification()` from `contexts/NotificationContext` exposes `showError` (used in `app/(tabs)/settings.tsx:159`).
- Produces: nothing.

Context: `focus.tsx` consumes `loading` only to gate the empty state and never reads `error`; while loading it shows "0/0 marks today" with no spinner; `handleQuickIncrement` swallows failures (`logger.error` only). Add a loading branch, an error branch, and user feedback on increment failure consistent with the mark detail screen.

- [ ] **Step 1: Add imports**

Add `ActivityIndicator` to the `react-native` import in `app/(tabs)/focus.tsx`, and add:

```tsx
import { useNotification } from '../../contexts/NotificationContext';
```

- [ ] **Step 2: Read `error` and `showError`**

Update the hook usage near `app/(tabs)/focus.tsx:61`:

```tsx
const { counters, loading, error, incrementCounter, deleteCounter } = useCounters();
const { showError } = useNotification();
```

- [ ] **Step 3: Surface increment failure**

In `handleQuickIncrement`'s catch (`app/(tabs)/focus.tsx:245-247`), replace the log-only handler:

```tsx
      } catch (error: unknown) {
        logger.error('Error incrementing mark:', error);
        showError('Could not log that. Try again.');
      }
```

Add `showError` to the `useCallback` dependency array for `handleQuickIncrement`.

- [ ] **Step 4: Add loading + error render branches**

Inside the `ScrollView` (`app/(tabs)/focus.tsx`), immediately after the greeting block and before the progress banner, add:

```tsx
{loading && activeCounters.length === 0 && (
  <View style={styles.loadingState}>
    <ActivityIndicator size="small" color={c.accent} />
  </View>
)}

{!loading && error && (
  <View style={[styles.errorBanner, { backgroundColor: applyOpacity(c.danger, 0.13) }]}>
    <Text style={[styles.errorBannerText, { color: c.danger }]}>{error}</Text>
  </View>
)}
```

Add the styles to the `StyleSheet.create` block:

```tsx
  loadingState: { paddingVertical: spacing.xxl, alignItems: 'center' },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBannerText: { fontFamily: fonts.sans, fontSize: fontSize.sm },
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean, no new lint errors, full suite green.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/focus.tsx
git commit -m "fix(3.1): add Home loading/error states + surface failed log feedback"
```

---

### Task 3: P1-4 — Functional Android target-date picker

**Files:**
- Modify: `app/goal/[id].tsx` (`handleOpenDatePicker` ~117-121; the date-picker `Modal` ~266-302)
- Test: none (platform-native UI; verified by read + type-check + lint; manual on Android per spec)

**Interfaces:**
- Consumes: `@react-native-community/datetimepicker` `DateTimePicker` (already imported), `Platform` (already imported), `handleSaveDate(date: Date)` (existing, `app/goal/[id].tsx:123`).
- Produces: nothing.

Context: the bottom-sheet `Modal` renders the picker + "Set date" button only under `Platform.OS === 'ios'`, leaving Android an empty sheet. On Android the community picker shows as a native dialog when mounted and fires `onChange` once; it should not live inside the custom modal. Branch the two platforms.

- [ ] **Step 1: Render the Android picker as a native dialog**

Replace the date-picker `Modal` block (`app/goal/[id].tsx:266-302`) so iOS keeps the bottom-sheet and Android mounts the picker directly:

```tsx
      {/* Date picker — iOS bottom sheet */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <TouchableOpacity style={[styles.modalSheet, { backgroundColor: c.surface }]} activeOpacity={1}>
              <Text style={[styles.modalLabel, { color: c.inkMuted }]}>TARGET DATE</Text>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => { if (date) setPickerDate(date); }}
                style={{ width: '100%' }}
              />
              <TouchableOpacity
                style={[styles.dateSetBtn, { backgroundColor: c.forest }]}
                onPress={() => handleSaveDate(pickerDate)}
              >
                <Text style={styles.dateSetBtnText}>Set date</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Date picker — Android native dialog */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (event.type === 'set' && date) {
              void handleSaveDate(date);
            }
          }}
        />
      )}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint`
Expected: clean. (Manual: on Android, opening TARGET DATE shows the native date dialog; picking a date persists it and closes; cancel closes with no change.)

- [ ] **Step 3: Commit**

```bash
git add app/goal/[id].tsx
git commit -m "fix(3.1): functional Android target-date picker (was empty modal)"
```

---

### Task 4: P1-5 — Remove non-functional privacy toggles; show real sync status

**Files:**
- Modify: `app/settings/privacy.tsx`
- Test: none (removal + visual; verified by read + type-check + lint)

**Interfaces:**
- Consumes: `useSync()` from `hooks/useSync` exposes `syncState` with `{ isSyncing: boolean; lastSyncedAt?: string | null; error?: string | null }` (used in `app/(tabs)/settings.tsx:155,268-273`).
- Produces: nothing.

Context: Analytics, Crash Reports, and Auto-lock toggles are local `useState` only — not persisted, not wired to any SDK (none exists). They misrepresent data-collection control. Decision: remove them. Keep the working biometric Face ID toggle. Replace the hardcoded "Synced" badge with real sync status.

- [ ] **Step 1: Remove the DATA COLLECTION section + Auto-lock**

In `app/settings/privacy.tsx`: delete the entire `DATA COLLECTION` `SectionLabel` + `SettingsCard`/`View` containing the Analytics and Crash Reports `ToggleRow`s (lines ~134-149), and delete the Auto-lock `ToggleRow` (lines ~164-187) leaving Face ID as the only row in SECURITY (mark it `isLast`). Remove now-unused state: `analytics`, `setAnalytics`, `crashReports`, `setCrashReports`, `autoLock`, `setAutoLock`, `autoLockOption`, `setAutoLockOption`, and the `AUTO_LOCK_OPTIONS` const. Remove now-unused styles `subRow`, `optPill`, `optText` if no longer referenced.

- [ ] **Step 2: Wire real sync status**

Add at the top of `PrivacyScreen`:

```tsx
import { useSync } from '../../hooks/useSync';
```
```tsx
const { syncState } = useSync();
const syncStatusText = syncState.isSyncing
  ? 'Syncing…'
  : syncState.error
    ? 'Sync error'
    : syncState.lastSyncedAt
      ? `Synced ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
      : 'Up to date';
const syncStatusColor = syncState.error ? c.danger : c.success;
```

Replace the hardcoded badge (lines ~196-198):

```tsx
            <View style={[styles.syncBadge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.syncBadgeText, { color: syncStatusColor }]}>{syncStatusText}</Text>
            </View>
```

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean (no unused-var errors), no new lint, suite green.

- [ ] **Step 4: Commit**

```bash
git add app/settings/privacy.tsx
git commit -m "fix(3.1): remove non-functional privacy toggles; show real sync status"
```

---

### Task 5: P1-2 — Wire the completion overlay's "Share your win"

**Files:**
- Modify: `components/overlays/GoalCompletionOverlay.tsx`
- Test: `tests/unit/goalCompletionOverlayShare.test.tsx` (create)

**Interfaces:**
- Consumes:
  - `useGoalCompletionStore()` → `{ completedGoal: Goal | null, show, hideCompletion }` (existing). `Goal` has `title`, `created_at`, `completed_at`, `target_date`, `banked_momentum_days`, `current_mark_count`.
  - `generateShareCard(ref: RefObject<View>): Promise<string>` (`lib/sharing/generateShareCard.ts:5`).
  - `SharePreviewModal` (`components/SharePreviewModal.tsx:87`) — props: `visible, goalTitle, canCustomize, style, onStyleChange, onRequestUpgrade, onShare, onSave, saveLabel, cardProps, onClose` (mirror usage at `app/goal/complete.tsx:252-274`).
  - `GoalCompletionShareCard` (`components/GoalCompletionShareCard`) — props: `forwardRef, goalTitle, completedDate, levelTitle, daysTaken, targetDateLabel, bankedMomentumDays, style` (mirror `app/goal/complete.tsx:239-250`).
  - `useShareCardStore()` → `{ style, updateStyle, loadShareCardStyle }`; `checkProStatus()`; `canCustomizeShareCard(unlocked)`; `useXPStore` `totalXP`; `getLevelForXP`, `LEVEL_TITLES` (`lib/xpEngine`).
- Produces: nothing.

Context: the live overlay's "Share your win" is `onPress={() => {}}` (`GoalCompletionOverlay.tsx:147`). The full share flow already exists in the dead `app/goal/complete.tsx` (never navigated to). Port that flow into the overlay so the shipped share-card feature is reachable from the real completion moment. (Deleting the dead screen is P2-1 — out of scope here.)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/goalCompletionOverlayShare.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GoalCompletionOverlay } from '../../components/overlays/GoalCompletionOverlay';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';

jest.mock('../../lib/iap/iap', () => ({ checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: false }) }));

const goal: any = {
  id: 'g1', title: 'Run a marathon', status: 'completed',
  created_at: '2026-05-01T00:00:00.000Z', completed_at: '2026-06-01T00:00:00.000Z',
  current_mark_count: 30, banked_momentum_days: 12,
};

describe('GoalCompletionOverlay share', () => {
  it('opens the share modal when "Share your win" is tapped', async () => {
    useGoalCompletionStore.setState({ completedGoal: goal, show: true });
    const { getByText, queryByText } = render(<GoalCompletionOverlay />);
    expect(queryByText('Save to Photos')).toBeNull();
    fireEvent.press(getByText('Share your win'));
    await waitFor(() => expect(getByText('Save to Photos')).toBeTruthy());
  });
});
```

(`'Save to Photos'` is the default `saveLabel` rendered by `SharePreviewModal` when visible.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- goalCompletionOverlayShare`
Expected: FAIL — modal never opens (`onPress` is a no-op).

- [ ] **Step 3: Add share state, derivations, and handlers**

In `GoalCompletionOverlay.tsx`, add imports (`useRef`, `useState`, `Platform`, `Sharing` from `expo-sharing`, `MediaLibrary` from `expo-media-library`, `useShareCardStore`, `checkProStatus`, `canCustomizeShareCard`, `generateShareCard`, `GoalCompletionShareCard`, `SharePreviewModal`, `useXPStore`, `getLevelForXP`, `LEVEL_TITLES`, `logger`). Inside the component, after the existing store hook:

```tsx
const shareCardRef = useRef<View>(null) as React.RefObject<View>;
const [shareModalVisible, setShareModalVisible] = useState(false);
const [canCustomize, setCanCustomize] = useState(false);
const [saveLabel, setSaveLabel] = useState('Save to Photos');
const style = useShareCardStore((s) => s.style);
const updateStyle = useShareCardStore((s) => s.updateStyle);
const loadShareCardStyle = useShareCardStore((s) => s.loadShareCardStyle);
const xp = useXPStore((s) => s.totalXP ?? 0);
const levelTitle = LEVEL_TITLES[getLevelForXP(xp) - 1] ?? 'Livra';

useEffect(() => { loadShareCardStyle(); }, [loadShareCardStyle]);

const completedDate = (completedGoal?.completed_at ?? new Date().toISOString()).slice(0, 10);
const daysTaken = completedGoal?.created_at && completedGoal?.completed_at
  ? Math.max(1, Math.round(
      (new Date(completedGoal.completed_at).getTime() - new Date(completedGoal.created_at).getTime()) / 86_400_000))
  : 1;
const targetDateLabel = completedGoal?.target_date && completedGoal?.completed_at
  ? (() => {
      const diff = Math.round(
        (new Date(completedGoal.completed_at).getTime() - new Date(completedGoal.target_date).getTime()) / 86_400_000);
      if (diff < 0) return `Finished ${Math.abs(diff)} days early`;
      if (diff > 0) return `Finished ${diff} days late`;
      return 'Finished right on time';
    })()
  : undefined;

const handleSharePress = useCallback(async () => {
  const { effectiveUnlocked } = await checkProStatus();
  setCanCustomize(canCustomizeShareCard(effectiveUnlocked));
  setShareModalVisible(true);
}, []);

const handleShareImage = useCallback(async () => {
  try {
    const uri = await generateShareCard(shareCardRef);
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your goal' });
  } catch (e) { logger.debug('[Share] failed', e); }
}, []);

const handleSaveImage = useCallback(async () => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { setSaveLabel('Failed, try again'); return; }
    const uri = await generateShareCard(shareCardRef);
    await MediaLibrary.saveToLibraryAsync(uri);
    setSaveLabel('Saved');
  } catch { setSaveLabel('Failed, try again'); }
}, []);
```

- [ ] **Step 4: Wire the button + render the card and modal**

Replace the no-op (`GoalCompletionOverlay.tsx:147`):

```tsx
<TouchableOpacity onPress={handleSharePress}>
  <Text style={[styles.shareText, { color: c.inkMuted }]}>Share your win</Text>
</TouchableOpacity>
```

Before the final closing `</Animated.View>` of the overlay root, add the offscreen card + modal (the offscreen card must stay mounted whenever `completedGoal` exists so the ref can rasterize):

```tsx
{completedGoal && (
  <View style={{ position: 'absolute', left: -10000, top: 0, opacity: 0 }} pointerEvents="none">
    <GoalCompletionShareCard
      forwardRef={shareCardRef}
      goalTitle={completedGoal.title}
      completedDate={completedDate}
      levelTitle={levelTitle}
      daysTaken={daysTaken}
      targetDateLabel={targetDateLabel}
      bankedMomentumDays={completedGoal.banked_momentum_days}
      style={style}
    />
  </View>
)}
<SharePreviewModal
  visible={shareModalVisible}
  goalTitle={completedGoal?.title ?? ''}
  canCustomize={canCustomize}
  style={style}
  onStyleChange={(patch) => updateStyle(patch)}
  onRequestUpgrade={() => { hideCompletion(); /* paywall opened by host route */ }}
  onShare={handleShareImage}
  onSave={handleSaveImage}
  saveLabel={saveLabel}
  cardProps={{
    goalTitle: completedGoal?.title ?? '',
    completedDate,
    levelTitle,
    daysTaken,
    targetDateLabel,
    bankedMomentumDays: completedGoal?.banked_momentum_days,
  }}
  onClose={() => { setShareModalVisible(false); setSaveLabel('Save to Photos'); }}
/>
```

Note on `onRequestUpgrade`: the overlay has no `router`. Import `useRouter` from `expo-router` and call `router.push('/paywall')` after `setShareModalVisible(false)` instead of the comment above — add `const router = useRouter();` near the top.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- goalCompletionOverlayShare`
Expected: PASS — tapping "Share your win" opens the modal (`Save to Photos` visible).

- [ ] **Step 6: Verify the whole suite + types**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean, no new lint, full suite green.

- [ ] **Step 7: Commit**

```bash
git add components/overlays/GoalCompletionOverlay.tsx tests/unit/goalCompletionOverlayShare.test.tsx
git commit -m "fix(3.1): wire completion overlay 'Share your win' to the share-card flow"
```

---

## Self-Review

**Spec coverage:** P0-1 (Task 1), P1-3 (Task 2), P1-4 (Task 3), P1-5 (Task 4 — removal per decision), P1-2 (Task 5). P1-1 and P1-6 intentionally excluded (carved out / held). All in-scope audit P0/P1 items mapped.

**Placeholder scan:** No "TBD"/"handle edge cases" steps; every code step shows code. Task 5's `onRequestUpgrade` note resolves to a concrete `router.push('/paywall')`.

**Type consistency:** `syncState` shape matches `app/(tabs)/settings.tsx` usage. Overlay share props mirror the proven `app/goal/complete.tsx` call sites verbatim (`GoalCompletionShareCard`, `SharePreviewModal`, `generateShareCard`). `useCounters()` `{counters, loading, error, incrementCounter, deleteCounter}` matches `hooks/useCounters.ts:672`.

## Execution Handoff

After saving, choose execution: subagent-driven (fresh subagent per task, review between) or inline (executing-plans with checkpoints).
