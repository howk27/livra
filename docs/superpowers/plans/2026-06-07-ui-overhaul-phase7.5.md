# UI Overhaul Phase 7.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply all 9 visual improvements from docs/Visual_update.md with zero logic changes and zero broken tests.

**Architecture:** Pure UI layer changes — no state, no lib, no db touches. Each task targets a single component or screen. Tasks 1-5 and 7-8 are independent; Task 9 absorbs the mark-detail half of Task 5 to avoid double-edits.

**Tech Stack:** React Native, Expo Router, Reanimated 4.x, Phosphor icons, DM Sans + CormorantGaramond fonts, Zustand (read-only for guard state), StyleSheet.create.

---

## Protected files — NEVER touch
`state/`, `lib/db/`, `lib/goalLogic.ts`, `hooks/useCounters.ts`, `supabase/`

## Design tokens (use these names, never hardcode hex)
| Token name | Hex |
|---|---|
| `c.forest` | #1C3830 |
| `c.linen` | #F0EDE8 |
| `c.surface` | #FAF9F7 |
| `c.surfaceAlt` | #E8E4DE |
| `c.mint` | #8DB5A8 |
| `c.inkDark` | #1A1A18 |
| `c.inkMuted` | #9A9A92 |
| `c.inkInverse` | #F0EDE8 |
| `c.inkInverseMuted` | #A8C4BC |
| `c.borderLight` | #E0DBD4 |
| `c.borderMid` | #C8C2BA |
| `c.accent` | use `#C47E8A` inline (dusty rose, no token) |

## Font reference
```ts
// Current tokens (theme/tokens.ts):
fonts.serif         = 'CormorantGaramond_700Bold'
fonts.serifSemibold = 'CormorantGaramond_600SemiBold'
fonts.serifItalic   = 'CormorantGaramond_400Regular_Italic'
fonts.sans          = 'DMSans_400Regular'
fonts.sansMedium    = 'DMSans_500Medium'
fonts.sansSemibold  = 'DMSans_600SemiBold'
fonts.sansBold      = 'DMSans_700Bold'  ← add this in Task 1
```

---

## Task 1 — Number Typography

**Files:**
- Modify: `theme/tokens.ts` — add `sansBold` font key
- Modify: `app/_layout.tsx` — load DMSans_700Bold
- Modify: `components/ui/StatTile.tsx` — switch number font from serif to sans

- [ ] **Step 1: Add `sansBold` to font tokens**

In `theme/tokens.ts`, find the `fonts` object and add `sansBold`:
```ts
export const fonts = {
  serif: 'CormorantGaramond_700Bold',
  serifSemibold: 'CormorantGaramond_600SemiBold',
  serifItalic: 'CormorantGaramond_400Regular_Italic',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemibold: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',   // ← add this line
  heading: 'CormorantGaramond_700Bold',
  regular: 'DMSans_400Regular',
};
```

- [ ] **Step 2: Load DMSans_700Bold in _layout.tsx**

In `app/_layout.tsx`, add `DMSans_700Bold` to the dm-sans import:
```ts
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
```
And add it to the `useFonts` call (find the existing font map and add `DMSans_700Bold`).

- [ ] **Step 3: Fix StatTile number font**

In `components/ui/StatTile.tsx`, change the value style:
```ts
// Before:
value: {
  fontFamily: fonts.serifSemibold,
  fontSize: 28,
},
// After:
value: {
  fontFamily: fonts.sansSemibold,
  fontSize: 28,
},
```

- [ ] **Step 4: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```
All tests must pass.

- [ ] **Step 5: Commit**
```bash
git add theme/tokens.ts app/_layout.tsx components/ui/StatTile.tsx
git commit -m "fix(typography): switch all numeric displays from serif to DM Sans"
```

---

## Task 2 — Focus Tab: Compact Progress Banner + Stat Strip

**Files:**
- Modify: `app/(tabs)/focus.tsx` — replace progress card and 2x2 stat grid

The current focus.tsx has:
1. A custom `progressCard` (dark green, shows `completedMarksToday/todayTotal` + streak) — REPLACE with compact banner (56px)
2. A 2x2 `StatTile` grid — REPLACE with single horizontal stat strip (44px, no cards, no shadows)

All data variables already exist; only the JSX and styles change.

- [ ] **Step 1: Replace progress card JSX with compact banner**

Find the progress card block (starts `{/* ── Today's Progress Card ── */}`) and replace it:
```tsx
{/* ── Compact Progress Banner ── */}
<View style={[styles.progressBanner, { backgroundColor: c.forest }]}>
  <View>
    <Text style={[styles.bannerFraction, { color: c.inkInverse }]}>
      {completedMarksToday}/{todayTotal}
    </Text>
    <Text style={[styles.bannerFractionLabel, { color: c.inkInverseMuted }]}>marks</Text>
  </View>
  <View style={styles.bannerStreak}>
    <Lightning size={14} color={c.mint} weight="duotone" />
    <Text style={[styles.bannerStreakText, { color: c.inkInverseMuted }]}>
      {overallStreakDays} day streak
    </Text>
  </View>
</View>
```

- [ ] **Step 2: Replace 2x2 stat tile grid with compact stat strip**

Find the stat tiles section (starts `{/* ── Stat Tiles 2x2 ── */}`) and replace it. Also remove the `CheckCircle, Pulse, Flag` icon imports from the import block (Lightning stays as it's used in the banner):
```tsx
{/* ── Compact Stat Strip ── */}
<View style={[styles.statStrip, { borderTopColor: c.borderLight, borderBottomColor: c.borderLight }]}>
  {[
    { value: `${completedMarksToday}/${todayTotal}`, label: 'TODAY' },
    { value: String(overallStreakDays), label: 'STREAK' },
    { value: String(thisWeekCount), label: 'THIS WEEK' },
    { value: String(activeGoalCount), label: 'GOALS' },
  ].map((item, idx, arr) => (
    <View
      key={item.label}
      style={[
        styles.statCell,
        idx < arr.length - 1 && [styles.statCellBorder, { borderRightColor: c.borderLight }],
      ]}
    >
      <Text style={[styles.statValue, { color: c.inkDark }]}>{item.value}</Text>
      <Text style={[styles.statLabel, { color: c.inkMuted }]}>{item.label}</Text>
    </View>
  ))}
</View>
```

- [ ] **Step 3: Add new styles and remove old ones**

Remove the old styles: `progressCard`, `progressCardContent`, `marksFraction`, `marksSubtitle`, `streakBlock`, `streakNumber`, `tilesSection`, `tilesRow`.

Add these new styles:
```ts
// Compact progress banner
progressBanner: {
  marginHorizontal: spacing.lg,
  marginTop: spacing.lg,
  borderRadius: radius.lg,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  height: 56,
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},
bannerFraction: {
  fontFamily: fonts.sansBold,
  fontSize: 20,
  lineHeight: 24,
},
bannerFractionLabel: {
  fontFamily: fonts.sans,
  fontSize: 12,
},
bannerStreak: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs,
},
bannerStreakText: {
  fontFamily: fonts.sansMedium,
  fontSize: 13,
},
// Compact stat strip
statStrip: {
  flexDirection: 'row',
  marginHorizontal: spacing.lg,
  marginTop: spacing.md,
  height: 44,
  borderTopWidth: 0.5,
  borderBottomWidth: 0.5,
},
statCell: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
statCellBorder: {
  borderRightWidth: 0.5,
},
statValue: {
  fontFamily: fonts.sansSemibold,
  fontSize: 16,
},
statLabel: {
  fontFamily: fonts.sans,
  fontSize: 10,
  letterSpacing: 0.5,
},
```

- [ ] **Step 4: Remove unused HeroCard and StatTile imports from focus.tsx**

Remove `import { HeroCard } from '../../components/ui/HeroCard';` and `import { StatTile } from '../../components/ui/StatTile';` from focus.tsx (StatTile is no longer used here). Also remove unused icon imports: `CheckCircle`, `Pulse`, `Flag`.

- [ ] **Step 5: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 6: Commit**
```bash
git add app/\(tabs\)/focus.tsx
git commit -m "feat(focus): replace 2x2 stat grid with compact progress banner and stat strip"
```

---

## Task 3 — CheckinButton: + to ✓ Animation

**Files:**
- Create: `components/ui/CheckinButton.tsx`
- Modify: `components/ui/MarkRow.tsx` — replace static log circle with CheckinButton

- [ ] **Step 1: Create CheckinButton.tsx**

```tsx
// components/ui/CheckinButton.tsx
import React, { useCallback } from 'react';
import { Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { TouchableOpacity } from 'react-native';
import { Check, Plus } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface CheckinButtonProps {
  checked: boolean;
  onCheckin: () => void;
  disabled?: boolean;
}

export function CheckinButton({ checked, onCheckin, disabled }: CheckinButtonProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(1);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handlePress = useCallback(() => {
    if (checked || disabled) return;
    runOnJS(triggerHaptic)();
    iconOpacity.value = withTiming(0, { duration: 100 });
    rotation.value = withTiming(360, { duration: 300 }, (finished) => {
      if (finished) runOnJS(onCheckin)();
    });
    scale.value = withSequence(
      withTiming(0.88, { duration: 120 }),
      withSpring(1, { damping: 12, stiffness: 280 }),
    );
  }, [checked, disabled, onCheckin, rotation, scale, iconOpacity, triggerHaptic]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  if (checked) {
    return (
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
          containerStyle,
        ]}
      >
        <Check size={11} color={c.inkInverse} weight="duotone" />
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || checked}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.borderMid, alignItems: 'center', justifyContent: 'center' },
          containerStyle,
        ]}
      >
        <Animated.View style={iconStyle}>
          <Plus size={11} color={c.inkMuted} weight="bold" />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Integrate CheckinButton into MarkRow.tsx**

In `components/ui/MarkRow.tsx`:

1. Add import: `import { CheckinButton } from './CheckinButton';`
2. Remove: `import { Check } from 'phosphor-react-native';` (no longer needed in MarkRow — unless Check is used elsewhere in the file)
3. Replace the log circle JSX (the TouchableOpacity + logCircleFilled/logCircleEmpty views) with:
```tsx
<CheckinButton
  checked={loggedToday ?? false}
  onCheckin={handleLog}
  disabled={loggedToday || !onLog}
/>
```
4. Remove the `handleLog` animation (the `checkScale` shared value and spring animation in MarkRow) since CheckinButton handles its own animation now. Keep the `handleLog` callback that calls `onLog()`.
5. Remove unused styles: `logCircleEmpty`, `logCircleFilled`.

- [ ] **Step 3: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 4: Commit**
```bash
git add components/ui/CheckinButton.tsx components/ui/MarkRow.tsx
git commit -m "feat(checkin): animate + to checkmark with spin transition on mark log"
```

---

## Task 4 — FAB: Hide When Sheet is Open

**Files:**
- Modify: `components/ui/SpeedDialFAB.tsx` — hide main FAB button when sheets are open

The SpeedDialFAB manages `markSheetVisible` and `goalSheetVisible` as local state. When either is true, the main FAB button should not be tappable/visible. The sheet components themselves still render (they need to animate out).

- [ ] **Step 1: Add visibility guard in SpeedDialFAB.tsx**

In `SpeedDialFAB.tsx`, find the main FAB `TouchableOpacity` block (the one with `styles.fab` style) and wrap it with a conditional:
```tsx
{/* Main FAB — hidden when a sheet is open */}
{!markSheetVisible && !goalSheetVisible && (
  <TouchableOpacity
    style={[styles.fab, { backgroundColor: colors.forest }]}
    onPress={toggle}
    activeOpacity={0.9}
  >
    <Animated.View style={fabRotateStyle}>
      <Feather name="plus" size={22} color={colors.inkInverse} />
    </Animated.View>
  </TouchableOpacity>
)}
```

Also collapse the FAB when a sheet opens. In `handleAddMark` and `handleAddGoal`, the collapse already happens before the sheet opens (via `doCollapse()` + `setExpanded(false)`), so no further change needed there.

- [ ] **Step 2: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 3: Commit**
```bash
git add components/ui/SpeedDialFAB.tsx
git commit -m "fix(fab): hide SpeedDialFAB when AddMark or AddGoal sheet is open"
```

---

## Task 5 — Apple Health: Move to Settings

**Files:**
- Create: `app/settings/integrations.tsx` — new integrations screen
- Modify: `app/(tabs)/settings.tsx` — add Integrations row to ACCOUNT section

Note: The Apple Health card removal from mark detail happens in Task 9 (which fully rewrites the mark detail screen). Do NOT touch mark/[id]/index.tsx in this task.

Expo Router auto-registers `app/settings/integrations.tsx` — no changes to `_layout.tsx` needed.

- [ ] **Step 1: Create app/settings/integrations.tsx**

```tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Heart, Plug } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function IntegrationsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Integrations" />
      <ScrollView contentContainerStyle={styles.content}>

        <SectionLabel style={styles.sectionLabel}>HEALTH</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#FF2D55', 0.12) }]}>
              <Heart size={20} color="#FF2D55" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Apple Health</Text>
              <Text style={[styles.rowMeta, { color: c.inkMuted }]}>Auto-log sleep, workouts & steps</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Connect</Text>
            </View>
          </View>
        </View>

        <SectionLabel style={[styles.sectionLabel, { opacity: 0.5 }]}>COMING SOON</SectionLabel>
        <View style={[styles.card, { backgroundColor: c.surface, opacity: 0.5 }]}>
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#4285F4', 0.12) }]}>
              <Plug size={20} color="#4285F4" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Google Fit</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: c.borderLight }]} />
          <View style={styles.row}>
            <View style={[styles.iconTile, { backgroundColor: hexToRgba('#007AFF', 0.12) }]}>
              <Plug size={20} color="#007AFF" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>Garmin</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.badgeText, { color: c.inkMuted }]}>Coming soon</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  separator: { height: 1, marginHorizontal: spacing.lg },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: { fontFamily: fonts.sansMedium, fontSize: 12 },
});
```

- [ ] **Step 2: Add Integrations row to settings.tsx**

In `app/(tabs)/settings.tsx`, in the ACCOUNT section `SettingsCard`, add an Integrations row before the Subscription row:
```tsx
<SettingsRow
  icon="link"
  label="Integrations"
  onPress={() => router.push('/settings/integrations' as any)}
/>
```

- [ ] **Step 3: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 4: Commit**
```bash
git add app/settings/integrations.tsx app/\(tabs\)/settings.tsx
git commit -m "feat(settings): move Apple Health integration from mark detail to Settings > Integrations"
```

---

## Task 6 — Email Mark Removal

**Status: ALREADY DONE.** The email mark does not exist in `lib/suggestedCounters.ts`. No action needed.

---

## Task 7 — AddMarkSheet: Give It Life

**Files:**
- Modify: `components/sheets/AddMarkSheet.tsx` — layout/copy upgrade, zero logic changes

Changes:
1. Title → `"What will you do every day?"` in LibreBaskerville_700Bold 24px
2. Subtitle → `"Pick something small enough to start today."` in DMSans_400 14px
3. Add `"POPULAR MARKS"` section label above categories
4. Rename category picker section and add forest-green selected state border
5. Label custom name input as `"OR CREATE YOUR OWN"`
6. Add live identity preview `"I am someone who ___"` below input
7. CTA text → `"Add this mark"` with disabled opacity 0.4

- [ ] **Step 1: Update the header copy and styles**

In `AddMarkSheet.tsx`, replace the title/subtitle block:
```tsx
{/* Header */}
<Text style={[styles.sheetTitle, { color: tc.inkDark }]}>
  What will you do every day?
</Text>
<Text style={[styles.sheetSubtitle, { color: tc.inkMuted }]}>
  Pick something small enough to start today.
</Text>
```

Update `sheetTitle` style to use serif:
```ts
sheetTitle: {
  fontFamily: fonts.serif,
  fontSize: 24,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  lineHeight: 30,
},
```

- [ ] **Step 2: Add POPULAR MARKS label above categories**

In the Category section, add `<SectionLabel>POPULAR MARKS</SectionLabel>` before the `<ScrollView>` of category pills. Update the section label text to remove the old `CATEGORY` label (it becomes "POPULAR MARKS"):
```tsx
<View style={styles.fieldBlock}>
  <SectionLabel>POPULAR MARKS</SectionLabel>
  <ScrollView horizontal ...>
```

Update category pill selected state to use forest green border + tint background:
```tsx
<TouchableOpacity
  key={cat.key}
  style={[
    styles.categoryPill,
    {
      backgroundColor: isSelected
        ? `${tc.forest}18`  // forest with ~10% opacity
        : tc.surfaceAlt,
      borderWidth: isSelected ? 1.5 : 0,
      borderColor: isSelected ? tc.forest : 'transparent',
    },
  ]}
  ...
>
```

- [ ] **Step 3: Update name input section with identity preview**

Replace the MARK NAME section with:
```tsx
<View style={styles.fieldBlock}>
  <SectionLabel>OR CREATE YOUR OWN</SectionLabel>
  <TextInput
    style={[styles.input, { backgroundColor: tc.surfaceAlt, color: tc.inkDark, borderColor: tc.borderLight }]}
    value={name}
    onChangeText={setName}
    placeholder="Name your mark..."
    placeholderTextColor={tc.inkMuted}
    returnKeyType="done"
  />
  {name.trim().length > 0 && (
    <Text style={[styles.identityPreview, { color: tc.inkMuted }]}>
      I am someone who {name.trim().toLowerCase()}.
    </Text>
  )}
</View>
```

Add identity preview style:
```ts
identityPreview: {
  fontFamily: fonts.sans,
  fontSize: 13,
  fontStyle: 'italic',
  marginTop: spacing.sm,
},
```

- [ ] **Step 4: Update CTA button**

Replace the `PillButton` with disabled opacity logic:
```tsx
<PillButton
  label={saving ? 'Adding…' : 'Add this mark'}
  onPress={handleSave}
  disabled={saving || !name.trim()}
  style={[styles.cta, { opacity: (!name.trim() && !saving) ? 0.4 : 1 }]}
/>
```

- [ ] **Step 5: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 6: Commit**
```bash
git add components/sheets/AddMarkSheet.tsx
git commit -m "feat(addmark): upgrade sheet layout with hierarchy and identity preview"
```

---

## Task 8 — AddGoalSheet: Two-Zone Restructure

**Files:**
- Modify: `components/sheets/AddGoalSheet.tsx` — layout and copy only, no logic changes

Zone 1 (Intent): headline + subtext + goal name + why
Zone 2 (Mechanics): target + deadline + linked marks with section labels
CTA: "Add to queue"

- [ ] **Step 1: Update title/subtitle header in AddGoalSheet.tsx**

Replace the sheetTitle and sheetSubtitle:
```tsx
<Text style={[styles.sheetTitle, { color: tc.inkDark }]}>New Goal</Text>
<Text style={[styles.sheetSubtitle, { color: tc.inkMuted }]}>
  What does finishing this make possible?
</Text>
```

Update styles:
```ts
sheetTitle: {
  fontFamily: fonts.serif,
  fontSize: 28,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  lineHeight: 34,
},
sheetSubtitle: {
  fontFamily: fonts.sans,
  fontSize: 14,
  fontStyle: 'italic',
  paddingHorizontal: spacing.lg,
  marginTop: spacing.xs,
},
```

- [ ] **Step 2: Update GOAL NAME placeholder**

In the Goal Name TextInput, change placeholder to `"Run a marathon..."` and font size to 17px:
```tsx
<TextInput
  style={[styles.input, styles.goalNameInput, { ... }]}
  placeholder="Run a marathon..."
  ...
/>
```

Add `goalNameInput` style:
```ts
goalNameInput: {
  height: 56,
  fontSize: 17,
  fontFamily: fonts.sansMedium,
},
```

- [ ] **Step 3: Update YOUR WHY placeholder**

Change placeholder to `"What will finishing this change?"`.

- [ ] **Step 4: Add visual divider between zones**

After the YOUR WHY field block and before the COMPLETION TARGET field block, add:
```tsx
{/* Zone divider */}
<View style={[styles.zoneDivider, { backgroundColor: tc.borderLight }]} />
<SectionLabel style={styles.zoneMechanicsLabel}>HOW IT WORKS</SectionLabel>
```

Add styles:
```ts
zoneDivider: {
  height: 1,
  marginHorizontal: spacing.lg,
  marginVertical: spacing.xl,
},
zoneMechanicsLabel: {
  paddingHorizontal: spacing.lg,
  marginBottom: spacing.sm,
},
```

- [ ] **Step 5: Update linked marks section label**

Change the LINKED MARKS section label to:
```tsx
<SectionLabel>WHICH MARKS FEED THIS?</SectionLabel>
```

- [ ] **Step 6: Update CTA button label**

Change `PillButton` label from `'Add Goal'` to `'Add to queue'`:
```tsx
<PillButton
  label={saving ? 'Adding…' : 'Add to queue'}
  onPress={handleSave}
  disabled={saving || !title.trim()}
  style={[styles.cta, { opacity: (!title.trim() && !saving) ? 0.4 : 1 }]}
/>
```

- [ ] **Step 7: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 8: Commit**
```bash
git add components/sheets/AddGoalSheet.tsx
git commit -m "feat(addgoal): restructure sheet into intent + mechanics zones"
```

---

## Task 9 — Mark Detail: Three Zones, Remove Health Card

**Files:**
- Modify: `app/mark/[id]/index.tsx` — restructure layout, remove Apple Health card, compact stat row

This task removes the Apple Health card (moved to Settings in Task 5) and restructures to 3 zones. The daily reminder card stays.

**Zone 1 — Identity (top):** category icon, mark name (serif 28px), unit label  
**Zone 2 — Today action (center):** compact stat row (TODAY + ALL TIME side-by-side) → log button → undo/reset links  
**Zone 3 — Context (below fold):** FEEDING INTO, HISTORY, TODAY'S NOTE, DAILY REMINDER

- [ ] **Step 1: Remove Apple Health card JSX**

In `app/mark/[id]/index.tsx`, find and delete the entire Apple Health settings card block:
```tsx
{/* ── Apple Health ─────────────────────────────────────────────── */}
<View style={styles.settingCard}>
  ...
</View>
```
Also remove the `HealthConnectBanner` component render line (line 715).

Also remove these now-unused imports:
- `Heart` from phosphor (if only used in health card)
- `handleConnectHealth`, `handleDisconnectHealth` handlers can stay (they're harmless, and removing them risks touching logic)
- Keep the health-related state variables (they're also harmless to leave)

Actually, be conservative: only remove the JSX render. Leave all the handler functions and state variables in place.

- [ ] **Step 2: Replace 2-tile stat row with compact inline stat row**

Find the `{/* ── Stat Tiles Row ── */}` block and replace it:
```tsx
{/* ── Compact Stat Row ── */}
<View style={styles.compactStatRow}>
  <View style={styles.compactStatCell}>
    <Text style={styles.compactStatValue}>{todayCount}/{dailyTarget}</Text>
    <Text style={styles.compactStatLabel}>today</Text>
  </View>
  <View style={[styles.compactStatDivider, { backgroundColor: c.borderLight }]} />
  <View style={styles.compactStatCell}>
    <Text style={styles.compactStatValue}>{allTimeTotal}</Text>
    <Text style={styles.compactStatLabel}>all time</Text>
  </View>
</View>
```

Remove the `StatTile` import from mark detail (it's no longer used there).

- [ ] **Step 3: Update log button text**

The log button already says "Log for Today" and "Logged today". Update to match the spec:
- Default: "Log today" (forest bg, inkInverse text)
- Logged: "Logged today ✓" (surfaceAlt bg, inkMuted text)

Find the log button JSX and update:
```tsx
{completedToday ? (
  <>
    <Check size={18} color="#C47E8A" weight="duotone" />
    <Text style={styles.logBtnTextDone}>Logged today ✓</Text>
  </>
) : (
  <>
    <CheckCircle size={22} color={c.inkInverse} weight="duotone" />
    <Text style={styles.logBtnText}>Log today</Text>
  </>
)}
```

Update logBtnTextDone color to use inkMuted:
```ts
logBtnTextDone: {
  fontFamily: fonts.sansMedium,
  fontSize: 16,
  color: c.inkMuted,
},
```

- [ ] **Step 4: Add compact stat row styles to createStyles**

In the `createStyles` function, add:
```ts
compactStatRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: spacing.md,
},
compactStatCell: {
  flex: 1,
  alignItems: 'center',
},
compactStatDivider: {
  width: 1,
  height: 32,
},
compactStatValue: {
  fontFamily: fonts.sansSemibold,
  fontSize: 20,
  color: c.inkDark,
},
compactStatLabel: {
  fontFamily: fonts.sans,
  fontSize: 12,
  color: c.inkMuted,
  marginTop: 2,
},
```

Also remove unused styles: `statRow` (if it only served the StatTile row).

- [ ] **Step 5: Remove unused imports**

After the JSX removal, check for unused imports:
- `HealthConnectBanner` import (remove if removed from JSX)
- `Heart` from phosphor (remove if only used in health card)
- `StatTile` (remove)

Also remove `import { applyOpacity } from '@/src/components/icons/color';` if it was only used in the health card.

- [ ] **Step 6: Run tests**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm test -- --passWithNoTests
```

- [ ] **Step 7: Run type-check**
```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check
```

- [ ] **Step 8: Commit**
```bash
git add app/mark/\[id\]/index.tsx
git commit -m "feat(markdetail): simplify to three zones, compact stat row, remove Apple Health card"
```

---

## Final Validation

- [ ] `npm test` — all tests passing
- [ ] `npm run type-check` — zero errors
- [ ] Update AUDIT_LOG.md with Phase 7.5 summary

### AUDIT_LOG.md entry to append:

```markdown
## Phase 7.5 — UI Overhaul (2026-06-07)

Visual improvements across Focus tab, mark detail, sheets, and shared components.
No logic changes; no protected files touched; all tests pass.

| File | Change |
|------|--------|
| `theme/tokens.ts` | Added `sansBold: 'DMSans_700Bold'` font token |
| `app/_layout.tsx` | Load `DMSans_700Bold` font |
| `components/ui/StatTile.tsx` | Number font: serif → DM Sans 600 |
| `app/(tabs)/focus.tsx` | Replaced progress card + 2×2 stat grid with compact banner (56px) + stat strip (44px) |
| `components/ui/CheckinButton.tsx` | Created: 3-state animated check-in button (+ → spin → ✓) |
| `components/ui/MarkRow.tsx` | Integrated CheckinButton, removed internal spring animation |
| `components/ui/SpeedDialFAB.tsx` | Hide FAB when AddMark or AddGoal sheet is open |
| `app/settings/integrations.tsx` | Created: Apple Health + Coming Soon integrations screen |
| `app/(tabs)/settings.tsx` | Added Integrations row in ACCOUNT section |
| `components/sheets/AddMarkSheet.tsx` | Upgraded layout: serif headline, identity preview, POPULAR MARKS label |
| `components/sheets/AddGoalSheet.tsx` | Restructured into Intent + Mechanics zones |
| `app/mark/[id]/index.tsx` | Simplified to 3 zones, compact stat row, removed Apple Health card |

**Task 6 (email removal): already absent from MARK_LIBRARY — no action needed.**
```
