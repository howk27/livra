# Share Card Free / Paid Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sharing a goal-completion card free, and add a Livra+ customization tier (4 themes, 4 accent swatches, 3 element toggles) inline in the share modal.

**Architecture:** A new pure module (`lib/sharing/shareCardThemes.ts`) is the single source of truth for card styling. `GoalCompletionShareCard` becomes parameterized by a `ShareCardStyle` prop (defaulting to today's card). A persisted Zustand slice remembers the user's style. `SharePreviewModal` renders the live card and a Customize section (full controls for Pro, a soft locked nudge for free). Sharing is no longer gated; only customization is.

**Tech Stack:** React Native 0.81, Expo SDK ~54, TypeScript 5.9 (strict), Zustand, `@react-native-async-storage/async-storage`, Jest (`jest-expo`) + `@testing-library/react-native`, `react-native-view-shot`.

## Global Constraints

- Color tokens from constants only, never hardcoded hex — **EXCEPT** the share card, which uses fixed per-theme palettes by design (it is a shareable image artifact that must look identical on any device theme). New non-card UI (the Customize controls) uses `theme/tokens`.
- Zustand slices only for persistent data; never `useState`. (`CLAUDE.md` Conventions.)
- No inline styles except dynamic values; otherwise `StyleSheet.create`.
- No dashes in user-facing copy: no em-dash (—), en-dash (–), or hyphen-as-dash (`PRODUCT.md:259`).
- All new behavior covered by tests written first (TDD). Full unit suite green, `npm run type-check` clean, `npm run lint` clean on new/changed files.
- Path alias `@/*` → repo root; existing files use relative imports — match the file you are editing.
- Test invocation: `npm run test -- <file>` runs a single Jest file.

---

### Task 1: Pure share-card theme module

**Files:**
- Create: `lib/sharing/shareCardThemes.ts`
- Test: `tests/unit/shareCardThemes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ShareCardThemeId = 'forest' | 'linen' | 'night' | 'sage'`
  - `type ShareCardAccentId = 'rose' | 'forest' | 'gold' | 'slate'`
  - `interface ShareCardStyle { themeId: ShareCardThemeId; accentId: ShareCardAccentId; showMomentum: boolean; showBadge: boolean; showDate: boolean }`
  - `interface ResolvedCardColors { bg: string; text: string; muted: string; accent: string }`
  - `const DEFAULT_SHARE_CARD_STYLE: ShareCardStyle`
  - `const SHARE_CARD_THEME_IDS: ShareCardThemeId[]`
  - `const SHARE_CARD_ACCENT_IDS: ShareCardAccentId[]`
  - `function resolveCardColors(style: ShareCardStyle): ResolvedCardColors`
  - `const SHARE_CARD_THEME_LABELS: Record<ShareCardThemeId, string>`
  - `const SHARE_CARD_ACCENT_HEX: Record<ShareCardAccentId, string>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/shareCardThemes.test.ts
import {
  DEFAULT_SHARE_CARD_STYLE,
  SHARE_CARD_THEME_IDS,
  SHARE_CARD_ACCENT_IDS,
  SHARE_CARD_ACCENT_HEX,
  resolveCardColors,
  type ShareCardStyle,
} from '../../lib/sharing/shareCardThemes';

describe('shareCardThemes', () => {
  it('default style reproduces the original Forest card', () => {
    expect(DEFAULT_SHARE_CARD_STYLE).toEqual({
      themeId: 'forest',
      accentId: 'rose',
      showMomentum: true,
      showBadge: true,
      showDate: true,
    });
    const colors = resolveCardColors(DEFAULT_SHARE_CARD_STYLE);
    expect(colors.bg).toBe('#1C2826');
    expect(colors.text).toBe('#F0E6D0');
    expect(colors.muted).toBe('rgba(240,230,208,0.55)');
    expect(colors.accent).toBe('#C47E8A');
  });

  it('exposes exactly four themes and four accents', () => {
    expect(SHARE_CARD_THEME_IDS).toEqual(['forest', 'linen', 'night', 'sage']);
    expect(SHARE_CARD_ACCENT_IDS).toEqual(['rose', 'forest', 'gold', 'slate']);
  });

  it('every theme id resolves to a full color set', () => {
    for (const themeId of SHARE_CARD_THEME_IDS) {
      const colors = resolveCardColors({
        ...DEFAULT_SHARE_CARD_STYLE,
        themeId,
      } as ShareCardStyle);
      expect(colors.bg).toMatch(/^#|^rgba/);
      expect(colors.text).toMatch(/^#|^rgba/);
      expect(colors.muted).toMatch(/^#|^rgba/);
    }
  });

  it('accent overrides theme accent', () => {
    const colors = resolveCardColors({ ...DEFAULT_SHARE_CARD_STYLE, accentId: 'gold' });
    expect(colors.accent).toBe(SHARE_CARD_ACCENT_HEX.gold);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shareCardThemes.test.ts`
Expected: FAIL — cannot find module `../../lib/sharing/shareCardThemes`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/sharing/shareCardThemes.ts

export type ShareCardThemeId = 'forest' | 'linen' | 'night' | 'sage';
export type ShareCardAccentId = 'rose' | 'forest' | 'gold' | 'slate';

export interface ShareCardStyle {
  themeId: ShareCardThemeId;
  accentId: ShareCardAccentId;
  showMomentum: boolean;
  showBadge: boolean;
  showDate: boolean;
}

export interface ResolvedCardColors {
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

/** Order is the swatch display order in the Customize section. */
export const SHARE_CARD_THEME_IDS: ShareCardThemeId[] = ['forest', 'linen', 'night', 'sage'];
export const SHARE_CARD_ACCENT_IDS: ShareCardAccentId[] = ['rose', 'forest', 'gold', 'slate'];

export const SHARE_CARD_THEME_LABELS: Record<ShareCardThemeId, string> = {
  forest: 'Forest',
  linen: 'Linen',
  night: 'Night',
  sage: 'Sage',
};

/** Fixed (non-token) palettes: the card must render the same on any device theme. */
const SHARE_CARD_THEME_PALETTES: Record<
  ShareCardThemeId,
  { bg: string; text: string; muted: string }
> = {
  forest: { bg: '#1C2826', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
  linen: { bg: '#F0E6D0', text: '#1C2826', muted: 'rgba(28,40,38,0.55)' },
  night: { bg: '#11151A', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
  sage: { bg: '#3A4A42', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
};

export const SHARE_CARD_ACCENT_HEX: Record<ShareCardAccentId, string> = {
  rose: '#C47E8A',
  forest: '#5E8C6A',
  gold: '#C9A24B',
  slate: '#7E8CA0',
};

export const DEFAULT_SHARE_CARD_STYLE: ShareCardStyle = {
  themeId: 'forest',
  accentId: 'rose',
  showMomentum: true,
  showBadge: true,
  showDate: true,
};

export function resolveCardColors(style: ShareCardStyle): ResolvedCardColors {
  const palette = SHARE_CARD_THEME_PALETTES[style.themeId];
  return {
    bg: palette.bg,
    text: palette.text,
    muted: palette.muted,
    accent: SHARE_CARD_ACCENT_HEX[style.accentId],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/shareCardThemes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sharing/shareCardThemes.ts tests/unit/shareCardThemes.test.ts
git commit -m "feat(share): pure share-card theme module (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 2: Replace dead gate with `canCustomizeShareCard`

**Files:**
- Modify: `lib/gating.ts:58-61` (remove `canUseShareCard`, add `canCustomizeShareCard`)
- Test: `tests/unit/gating.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Consumes: nothing.
- Produces: `function canCustomizeShareCard(isPro: boolean): boolean`. `canUseShareCard` no longer exported.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/gating.test.ts` (create the file with this content if it does not exist):

```typescript
import { canCustomizeShareCard } from '../../lib/gating';

describe('canCustomizeShareCard', () => {
  it('allows customization only for Pro users', () => {
    expect(canCustomizeShareCard(true)).toBe(true);
    expect(canCustomizeShareCard(false)).toBe(false);
  });

  it('no longer exports the old canUseShareCard gate', () => {
    const gating = require('../../lib/gating');
    expect(gating.canUseShareCard).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/gating.test.ts`
Expected: FAIL — `canCustomizeShareCard` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `lib/gating.ts`, replace the `canUseShareCard` block (lines 58-61):

```typescript
/** Customizing the share card (themes, accent, element toggles) is a Livra+ feature. Sharing itself is free. */
export function canCustomizeShareCard(isPro: boolean): boolean {
  return isPro;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/gating.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify nothing else imported the old gate**

Run: `grep -rn "canUseShareCard" --include="*.ts" --include="*.tsx" app/ components/ state/ lib/ hooks/ services/ tests/`
Expected: no output (all references removed). If any appear, update them to `canCustomizeShareCard` before committing.

- [ ] **Step 6: Commit**

```bash
git add lib/gating.ts tests/unit/gating.test.ts
git commit -m "feat(share): canCustomizeShareCard gate, drop dead canUseShareCard (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 3: Persisted share-card style slice

**Files:**
- Create: `state/shareCardSlice.ts`
- Test: `tests/unit/shareCardSlice.test.ts`

**Interfaces:**
- Consumes: `ShareCardStyle`, `DEFAULT_SHARE_CARD_STYLE` from `lib/sharing/shareCardThemes`.
- Produces:
  - `const SHARE_CARD_STYLE_KEY = 'livra_share_card_style_v1'`
  - `useShareCardStore` with state `{ style: ShareCardStyle; loaded: boolean }` and actions `setStyle(style: ShareCardStyle): Promise<void>`, `updateStyle(patch: Partial<ShareCardStyle>): Promise<void>`, `loadShareCardStyle(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/shareCardSlice.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShareCardStore, SHARE_CARD_STYLE_KEY } from '../../state/shareCardSlice';
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
}));

describe('shareCardSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShareCardStore.setState({ style: DEFAULT_SHARE_CARD_STYLE, loaded: false });
  });

  it('defaults to DEFAULT_SHARE_CARD_STYLE', () => {
    expect(useShareCardStore.getState().style).toEqual(DEFAULT_SHARE_CARD_STYLE);
  });

  it('updateStyle merges a patch and persists it', async () => {
    await useShareCardStore.getState().updateStyle({ themeId: 'night', showBadge: false });
    const { style } = useShareCardStore.getState();
    expect(style.themeId).toBe('night');
    expect(style.showBadge).toBe(false);
    expect(style.accentId).toBe('rose'); // untouched
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      SHARE_CARD_STYLE_KEY,
      JSON.stringify(style)
    );
  });

  it('loadShareCardStyle rehydrates a persisted style', async () => {
    const stored = { ...DEFAULT_SHARE_CARD_STYLE, accentId: 'gold' as const };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));
    await useShareCardStore.getState().loadShareCardStyle();
    expect(useShareCardStore.getState().style.accentId).toBe('gold');
    expect(useShareCardStore.getState().loaded).toBe(true);
  });

  it('loadShareCardStyle falls back to default on missing/invalid storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not json');
    await useShareCardStore.getState().loadShareCardStyle();
    expect(useShareCardStore.getState().style).toEqual(DEFAULT_SHARE_CARD_STYLE);
    expect(useShareCardStore.getState().loaded).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shareCardSlice.test.ts`
Expected: FAIL — cannot find module `../../state/shareCardSlice`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// state/shareCardSlice.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SHARE_CARD_STYLE,
  type ShareCardStyle,
} from '../lib/sharing/shareCardThemes';

export const SHARE_CARD_STYLE_KEY = 'livra_share_card_style_v1';

interface ShareCardState {
  style: ShareCardStyle;
  loaded: boolean;
  setStyle: (style: ShareCardStyle) => Promise<void>;
  updateStyle: (patch: Partial<ShareCardStyle>) => Promise<void>;
  loadShareCardStyle: () => Promise<void>;
}

export const useShareCardStore = create<ShareCardState>((set, get) => ({
  style: DEFAULT_SHARE_CARD_STYLE,
  loaded: false,

  setStyle: async (style) => {
    set({ style });
    await AsyncStorage.setItem(SHARE_CARD_STYLE_KEY, JSON.stringify(style));
  },

  updateStyle: async (patch) => {
    const next = { ...get().style, ...patch };
    set({ style: next });
    await AsyncStorage.setItem(SHARE_CARD_STYLE_KEY, JSON.stringify(next));
  },

  loadShareCardStyle: async () => {
    try {
      const raw = await AsyncStorage.getItem(SHARE_CARD_STYLE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ShareCardStyle>;
        set({ style: { ...DEFAULT_SHARE_CARD_STYLE, ...parsed }, loaded: true });
        return;
      }
    } catch {
      // fall through to default
    }
    set({ style: DEFAULT_SHARE_CARD_STYLE, loaded: true });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/shareCardSlice.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add state/shareCardSlice.ts tests/unit/shareCardSlice.test.ts
git commit -m "feat(share): persisted share-card style slice (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 4: Parameterize `GoalCompletionShareCard` by style

**Files:**
- Modify: `components/GoalCompletionShareCard.tsx`
- Test: `tests/unit/shareCard.test.ts` (existing — extend, keep existing assertions green)

**Interfaces:**
- Consumes: `ShareCardStyle`, `DEFAULT_SHARE_CARD_STYLE`, `resolveCardColors` from `lib/sharing/shareCardThemes`.
- Produces: `GoalCompletionShareCardProps` gains `style?: ShareCardStyle` (defaults to `DEFAULT_SHARE_CARD_STYLE`). Colors are resolved from the style; `showMomentum`/`showBadge`/`showDate` gate their rows.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/shareCard.test.ts`:

```typescript
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

describe('GoalCompletionShareCard styling', () => {
  const base = {
    goalTitle: 'Run a 5K',
    completedDate: '2026-05-29',
    levelTitle: 'Focused',
    daysTaken: 42,
    bankedMomentumDays: 12,
  };

  it('hides the level badge when showBadge is false', () => {
    const { queryByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: { ...DEFAULT_SHARE_CARD_STYLE, showBadge: false },
      })
    );
    expect(queryByText('Focused')).toBeNull();
  });

  it('hides the date/days meta when showDate is false', () => {
    const { queryByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: { ...DEFAULT_SHARE_CARD_STYLE, showDate: false },
      })
    );
    expect(queryByText('42 days')).toBeNull();
  });

  it('always renders goal title and completion line regardless of toggles', () => {
    const { getByText } = render(
      React.createElement(GoalCompletionShareCard, {
        ...base,
        style: {
          ...DEFAULT_SHARE_CARD_STYLE,
          showBadge: false,
          showDate: false,
          showMomentum: false,
        },
      })
    );
    expect(getByText('Run a 5K')).toBeTruthy();
    expect(getByText("Done. That one's yours forever.")).toBeTruthy();
  });
});
```

> Note: the existing tests in this file pass no `style` prop, so they exercise the default path and must stay green.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/shareCard.test.ts`
Expected: FAIL — the new `showBadge:false` test still finds "Focused" (toggles not implemented yet).

- [ ] **Step 3: Write minimal implementation**

Edit `components/GoalCompletionShareCard.tsx`:

1. Add import at top (after existing imports):

```typescript
import {
  DEFAULT_SHARE_CARD_STYLE,
  resolveCardColors,
  type ShareCardStyle,
} from '../lib/sharing/shareCardThemes';
```

2. Remove the four module-level color constants (`CARD_BG`, `CARD_TEXT`, `CARD_MUTED`, `CARD_ACCENT`) — colors now come from `resolveCardColors`.

3. Add `style?: ShareCardStyle;` to `GoalCompletionShareCardProps`, and accept it in the destructured params with a default:

```typescript
  style = DEFAULT_SHARE_CARD_STYLE,
```

4. At the top of the component body, resolve colors:

```typescript
  const colors = resolveCardColors(style);
```

5. Apply colors inline (dynamic values, allowed) by merging with the static `StyleSheet` styles, and gate the optional rows. Replace the JSX body with:

```tsx
  return (
    <View ref={forwardRef} collapsable={false} style={[styles.card, { backgroundColor: colors.bg }]}>
      <View style={styles.topSection}>
        <Text style={[styles.wordmark, { color: colors.accent }]}>LIVRA</Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={4} adjustsFontSizeToFit>
          {goalTitle}
        </Text>

        <Text style={[styles.completionCopy, { color: colors.muted }]}>
          {"Done. That one's yours forever."}
        </Text>

        {(style.showDate || style.showMomentum) ? (
          <View style={styles.metaRow}>
            {style.showDate ? <Text style={[styles.metaText, { color: colors.muted }]}>{displayDate}</Text> : null}
            {style.showDate ? <Text style={[styles.metaText, { color: colors.muted }]}>{daysTaken} days</Text> : null}
            {style.showDate && targetDateLabel != null ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>{targetDateLabel}</Text>
            ) : null}
            {style.showMomentum && bankedLine != null ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>{bankedLine}</Text>
            ) : null}
          </View>
        ) : null}

        {style.showBadge ? (
          <View style={[styles.levelBadge, { borderColor: colors.accent }]}>
            <Text style={[styles.levelBadgeText, { color: colors.accent }]}>{levelTitle}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomSection}>
        <Text style={[styles.footer, { color: colors.muted }]}>livra app</Text>
      </View>
    </View>
  );
```

6. In `StyleSheet.create`, remove the now-duplicated `color`/`backgroundColor`/`borderColor` keys from `card`, `wordmark`, `goalTitle`, `completionCopy`, `metaText`, `levelBadge`, `levelBadgeText`, `footer` (they are applied inline now). Leave all layout/typography keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/shareCard.test.ts`
Expected: PASS (existing default-path tests + 3 new styling tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/GoalCompletionShareCard.tsx tests/unit/shareCard.test.ts
git commit -m "feat(share): parameterize completion card by ShareCardStyle (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 5: Customize section + live preview in `SharePreviewModal`

**Files:**
- Modify: `components/SharePreviewModal.tsx`
- Test: `tests/unit/sharePreviewModal.test.tsx` (existing — extend)

**Interfaces:**
- Consumes: `ShareCardStyle`, `SHARE_CARD_THEME_IDS`, `SHARE_CARD_ACCENT_IDS`, `SHARE_CARD_THEME_LABELS`, `SHARE_CARD_ACCENT_HEX`, `resolveCardColors` from `lib/sharing/shareCardThemes`; `GoalCompletionShareCard` for the live preview.
- Produces: `SharePreviewModalProps` gains:
  - `canCustomize: boolean`
  - `style: ShareCardStyle`
  - `onStyleChange: (patch: Partial<ShareCardStyle>) => void`
  - `onRequestUpgrade: () => void`
  - `cardProps: { goalTitle: string; completedDate: string; levelTitle: string; daysTaken: number; targetDateLabel?: string; bankedMomentumDays?: number | null }` — data the live preview card needs.
  - `forwardRef: React.RefObject<View>` — the ref the parent captures for sharing.
  - The existing `imageUri` prop is removed (preview is now the live component, captured on demand by the parent).

> **Capture flow change:** the parent (`complete.tsx`, Task 6) owns the `forwardRef`'d off-screen full-size card and calls `generateShareCard` in its own `handleShare`/`handleSave`. To keep this task self-contained and testable, the modal accepts `onShare: () => void` and `onSave: () => void` callbacks (replacing the modal's internal capture). Update props accordingly: add `onShare`, `onSave`, and `saveLabel: string`; remove the internal `Sharing`/`MediaLibrary` calls and `imageUri` gating. Keep haptics in the parent.

- [ ] **Step 1: Write the failing test**

Replace the body of `tests/unit/sharePreviewModal.test.tsx` with tests for the new contract (keep the file's existing mocks for `expo-sharing`/`expo-media-library`/`expo-haptics` if present; add them if not):

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SharePreviewModal } from '../../components/SharePreviewModal';
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

const baseProps = {
  visible: true,
  goalTitle: 'Run a 5K',
  style: DEFAULT_SHARE_CARD_STYLE,
  onStyleChange: jest.fn(),
  onRequestUpgrade: jest.fn(),
  onShare: jest.fn(),
  onSave: jest.fn(),
  onClose: jest.fn(),
  saveLabel: 'Save to Photos',
  cardProps: {
    goalTitle: 'Run a 5K',
    completedDate: '2026-05-29',
    levelTitle: 'Focused',
    daysTaken: 42,
  },
  forwardRef: React.createRef(),
};

describe('SharePreviewModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('free users see the locked customize nudge, not the controls', () => {
    const { getByText, queryByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} />
    );
    expect(getByText('Customize · Livra+')).toBeTruthy();
    expect(queryByText('Forest')).toBeNull(); // theme swatch label not shown to free
  });

  it('tapping the locked nudge requests upgrade', () => {
    const onRequestUpgrade = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} onRequestUpgrade={onRequestUpgrade} />
    );
    fireEvent.press(getByText('Customize · Livra+'));
    expect(onRequestUpgrade).toHaveBeenCalledTimes(1);
  });

  it('Pro users see theme controls and can change style', () => {
    const onStyleChange = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize onStyleChange={onStyleChange} />
    );
    fireEvent.press(getByText('Night'));
    expect(onStyleChange).toHaveBeenCalledWith({ themeId: 'night' });
  });

  it('Share and Save work in both tiers', () => {
    const onShare = jest.fn();
    const onSave = jest.fn();
    const { getByText } = render(
      <SharePreviewModal {...baseProps} canCustomize={false} onShare={onShare} onSave={onSave} />
    );
    fireEvent.press(getByText('Share'));
    fireEvent.press(getByText('Save to Photos'));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/sharePreviewModal.test.tsx`
Expected: FAIL — new props/strings not present.

- [ ] **Step 3: Write minimal implementation**

Rewrite `components/SharePreviewModal.tsx` with this contract. Key points:
- Replace the `imageUri` `Image` preview with a scaled live `GoalCompletionShareCard` (wrap in a `View` sized to the card's 16:9 aspect: `previewWidth = SCREEN_WIDTH - spacing.xl*2`, `previewHeight = previewWidth * 9/16`). Pass `{...cardProps}`, `style={style}`, `forwardRef={forwardRef}`. Render the off-screen full-size capture card in the parent (Task 6), not here; here the preview can be display-only (no ref needed) OR reuse `forwardRef` — to avoid duplicate refs, the preview here is display-only and the parent owns the capture card. So the modal preview just renders `<GoalCompletionShareCard {...cardProps} style={style} />` without a ref.
- Remove internal `Sharing`/`MediaLibrary`/`Haptics`/`saveState` logic; call `onShare`/`onSave` instead. Display `saveLabel` (passed from parent) on the secondary button.
- Customize section under the preview:

```tsx
{canCustomize ? (
  <View style={styles.customize}>
    <Text style={[styles.customizeHeader, { color: c.inkMid }]}>Customize</Text>

    {/* Theme swatches */}
    <View style={styles.swatchRow}>
      {SHARE_CARD_THEME_IDS.map((id) => {
        const colors = resolveCardColors({ ...style, themeId: id });
        return (
          <TouchableOpacity
            key={id}
            onPress={() => onStyleChange({ themeId: id })}
            accessibilityRole="button"
            accessibilityLabel={SHARE_CARD_THEME_LABELS[id]}
            style={[
              styles.swatch,
              { backgroundColor: colors.bg, borderColor: style.themeId === id ? c.forest : 'transparent' },
            ]}
          >
            <Text style={[styles.swatchLabel, { color: colors.text }]}>{SHARE_CARD_THEME_LABELS[id]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>

    {/* Accent swatches */}
    <View style={styles.swatchRow}>
      {SHARE_CARD_ACCENT_IDS.map((id) => (
        <TouchableOpacity
          key={id}
          onPress={() => onStyleChange({ accentId: id })}
          accessibilityRole="button"
          accessibilityLabel={`Accent ${id}`}
          style={[
            styles.accentSwatch,
            { backgroundColor: SHARE_CARD_ACCENT_HEX[id], borderColor: style.accentId === id ? c.inkDark : 'transparent' },
          ]}
        />
      ))}
    </View>

    {/* Element toggles */}
    <ToggleRow label="Momentum line" value={style.showMomentum} onToggle={() => onStyleChange({ showMomentum: !style.showMomentum })} c={c} />
    <ToggleRow label="Level badge" value={style.showBadge} onToggle={() => onStyleChange({ showBadge: !style.showBadge })} c={c} />
    <ToggleRow label="Date" value={style.showDate} onToggle={() => onStyleChange({ showDate: !style.showDate })} c={c} />
  </View>
) : (
  <TouchableOpacity
    style={styles.lockedNudge}
    onPress={onRequestUpgrade}
    accessibilityRole="button"
    accessibilityLabel="Customize with Livra+"
  >
    <Text style={[styles.lockedNudgeText, { color: c.inkMid }]}>Customize · Livra+</Text>
  </TouchableOpacity>
)}
```

Add a small local `ToggleRow` component (label + a `Switch` from `react-native`) and a `c` color param. Add the referenced styles (`customize`, `customizeHeader`, `swatchRow`, `swatch`, `swatchLabel`, `accentSwatch`, `lockedNudge`, `lockedNudgeText`) to the `StyleSheet`. Import the theme/accent constants and `GoalCompletionShareCard` at top. Copy strings must be dash-free.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/sharePreviewModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/SharePreviewModal.tsx tests/unit/sharePreviewModal.test.tsx
git commit -m "feat(share): customize section + live preview in share modal (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 6: Wire `complete.tsx` — free sharing, style, capture

**Files:**
- Modify: `app/goal/complete.tsx`
- Test: `tests/unit/goalCompleteShare.test.tsx` (existing — update)

**Interfaces:**
- Consumes: `canCustomizeShareCard` (`lib/gating`), `useShareCardStore` (`state/shareCardSlice`), the new `SharePreviewModal` props (Task 5), `generateShareCard`.
- Produces: no exports; behavior change only.

- [ ] **Step 1: Write the failing test**

Update `tests/unit/goalCompleteShare.test.tsx`. Change the iap mock to a free user and assert no paywall bounce on share. Add/adjust:

```typescript
// free user mock
jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: false }),
}));

// add slice mock
jest.mock('../../state/shareCardSlice', () => {
  const { DEFAULT_SHARE_CARD_STYLE } = require('../../lib/sharing/shareCardThemes');
  return {
    useShareCardStore: jest.fn((fn: any) =>
      fn({ style: DEFAULT_SHARE_CARD_STYLE, updateStyle: jest.fn(), loadShareCardStyle: jest.fn() })
    ),
  };
});
```

```typescript
it('free user can open the share modal without being sent to the paywall', async () => {
  const push = jest.fn();
  jest.spyOn(require('expo-router'), 'useRouter').mockReturnValue({ replace: jest.fn(), push });
  const { getByText, findByText } = render(<GoalCompleteScreen />);
  fireEvent.press(getByText('Share this moment'));
  // modal opens; Share button visible; paywall NOT pushed
  expect(await findByText('Save to Photos')).toBeTruthy();
  expect(push).not.toHaveBeenCalledWith('/paywall');
});
```

> Keep the existing mocks block intact; only the iap mock value and the added slice mock change. If the existing file already asserts the old paywall-bounce behavior, remove that assertion (it is the behavior we are deleting).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalCompleteShare.test.tsx`
Expected: FAIL — free user is still bounced to `/paywall` by the current `handleSharePress`.

- [ ] **Step 3: Write minimal implementation**

In `app/goal/complete.tsx`:

1. Add imports:

```typescript
import { canCustomizeShareCard } from '../../lib/gating';
import { useShareCardStore } from '../../state/shareCardSlice';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
```

2. Add state for Pro + style + save label:

```typescript
const style = useShareCardStore((s) => s.style);
const updateStyle = useShareCardStore((s) => s.updateStyle);
const loadShareCardStyle = useShareCardStore((s) => s.loadShareCardStyle);
const [canCustomize, setCanCustomize] = useState(false);
const [saveLabel, setSaveLabel] = useState('Save to Photos');

useEffect(() => { loadShareCardStyle(); }, [loadShareCardStyle]);
```

3. Replace `handleSharePress` (the paywall bounce) with opening the modal and resolving Pro for customization only:

```typescript
const handleSharePress = useCallback(async () => {
  const { effectiveUnlocked } = await checkProStatus();
  setCanCustomize(canCustomizeShareCard(effectiveUnlocked));
  setShareModalVisible(true);
}, []);
```

4. Add capture-backed `handleShare` / `handleSave` (the modal calls these):

```typescript
const handleShareImage = useCallback(async () => {
  try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
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

5. The off-screen full-size capture card now reflects `style`:

```tsx
<GoalCompletionShareCard
  forwardRef={shareCardRef}
  goalTitle={goalTitle ?? ''}
  completedDate={getAppDate().toISOString().slice(0, 10)}
  levelTitle={levelTitle}
  daysTaken={daysTaken}
  targetDateLabel={targetDateLabel}
  bankedMomentumDays={completedGoal?.banked_momentum_days}
  style={style}
/>
```

6. Update the `SharePreviewModal` usage to the new props:

```tsx
<SharePreviewModal
  visible={shareModalVisible}
  goalTitle={goalTitle ?? ''}
  canCustomize={canCustomize}
  style={style}
  onStyleChange={(patch) => updateStyle(patch)}
  onRequestUpgrade={() => router.push('/paywall')}
  onShare={handleShareImage}
  onSave={handleSaveImage}
  saveLabel={saveLabel}
  cardProps={{
    goalTitle: goalTitle ?? '',
    completedDate: getAppDate().toISOString().slice(0, 10),
    levelTitle,
    daysTaken,
    targetDateLabel,
    bankedMomentumDays: completedGoal?.banked_momentum_days,
  }}
  onClose={() => { setShareModalVisible(false); setSaveLabel('Save to Photos'); }}
/>
```

7. Remove now-unused state: `shareImageUri`, `shareLoading` (and the `'Preparing…'` label logic) if no longer referenced. Keep the `shareCardRef`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalCompleteShare.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/goal/complete.tsx tests/unit/goalCompleteShare.test.tsx
git commit -m "feat(share): free sharing + style wiring in completion flow (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 7: Reframe paywall share entry

**Files:**
- Modify: `app/paywall.tsx:55` and `:65`
- Test: none new (copy change; covered by type-check + existing paywall tests if any)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Update the feature copy**

In `app/paywall.tsx`, change the `ShareNetwork` row (line 55):

```typescript
  { icon: ShareNetwork, title: 'Custom Share Cards', description: 'Restyle your finish. Themes, accent, and layout.' },
```

And update the matching entry in `SHIPPED_PREMIUM_FEATURE_TITLES` (line 65):

```typescript
  'Custom Share Cards',
```

- [ ] **Step 2: Verify copy is dash-free and types pass**

Run: `npm run type-check`
Expected: no errors.
Manually confirm the two new strings contain no em-dash, en-dash, or hyphen-as-dash.

- [ ] **Step 3: Commit**

```bash
git add app/paywall.tsx
git commit -m "feat(share): reframe paywall to Custom Share Cards (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 8: Docs + full verification gate

**Files:**
- Modify: `PRODUCT.md` (the `:428` stress point block), `ROADMAP.md` (Phase 2.2 line)
- Test: full suite

**Interfaces:** none.

- [ ] **Step 1: Update PRODUCT.md stress point**

Replace the share-card stress-point block (the `> **Stress point — resolve while building:**` paragraph beginning "The code contradicts this directly: `canUseShareCard(isPro)`...") with:

```markdown
> **Stress point — RESOLVED (Phase 2.2):** Sharing the completion card is now free (the inline
> Pro bounce in `app/goal/complete.tsx` is gone). Customization is the Livra+ tier:
> `canCustomizeShareCard(isPro)` in `lib/gating.ts` gates a 4-theme picker, accent swatches, and
> element toggles surfaced inline in `SharePreviewModal`; free users get the default preset and a
> soft "Customize · Livra+" nudge. `canUseShareCard` (dead code) was removed. Paywall reframed to
> "Custom Share Cards". Design: `docs/superpowers/specs/2026-06-21-share-card-split-design.md`.
```

- [ ] **Step 2: Tick ROADMAP.md Phase 2.2**

Change the `- [ ] **2.2 — Share card free/paid split**` line to `- [x]` and append: `DONE (feat/share-card-split): sharing free, Livra+ customization (themes/accent/toggles) inline in SharePreviewModal, canUseShareCard removed. Plan: docs/superpowers/plans/2026-06-21-share-card-split.md.`

- [ ] **Step 3: Run the full suite + lint + type-check**

Run: `npm run test`
Expected: all green (existing suite + the new share-card tests).
Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: no new errors on changed files.

- [ ] **Step 4: Verify the Definition of Done**

Confirm against the spec §9: sharing free, customization gated, dead code gone, paywall reframed, no dashes in new copy, PRODUCT/ROADMAP updated. Spot-check `grep -rn "canUseShareCard"` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add PRODUCT.md ROADMAP.md
git commit -m "docs(share): close PRODUCT.md:428 + tick ROADMAP 2.2 (Phase 2.2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

## Self-Review notes

- **Spec coverage:** §2 split → Tasks 2,6,7; §3 custom tier → Tasks 1,4,5; §4 surface/upsell → Tasks 5,6; §5 architecture (themes/gating/slice/card/modal/complete/paywall) → Tasks 1–7; §6 copy → Tasks 5,7; §7 testing → every task is TDD; §8 out-of-scope respected (no color wheel, no editor route); §9 DoD → Task 8.
- **Type consistency:** `ShareCardStyle`, `resolveCardColors`, `canCustomizeShareCard`, `useShareCardStore.updateStyle(patch)`, modal props (`canCustomize`, `style`, `onStyleChange`, `onRequestUpgrade`, `onShare`, `onSave`, `saveLabel`, `cardProps`) are used identically across Tasks 1→6.
- **Note for implementer:** Task 5 changes `SharePreviewModal`'s public contract (drops `imageUri`, moves capture to the parent). Task 6 is where the parent re-owns capture; do Tasks 5 and 6 in order and do not ship between them without the suite green.
