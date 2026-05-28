# Onboarding Redesign — Design Spec
**Date:** 2026-05-28
**Status:** Approved

---

## Overview

Replace the existing single-file `app/onboarding.tsx` with a 5-screen stack flow. New onboarding sets the emotional tone, learns enough to recommend marks, and ends with the user's first goal already created. The old "activation tap" UX is dropped — Screen 5 is the completion moment.

Triggered on first app launch after account creation. One-time only.

---

## Data Model

### Supabase — `profiles` table additions

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_focus_area text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
```

`onboarding_completed` already exists. No local AsyncStorage changes — these two new columns are written once on completion and never read back for product features.

No SQLite/AsyncStorage mirror needed for `onboarding_focus_area` or `onboarding_completed_at`.

---

## State — `state/onboardingSlice.ts`

Transient Zustand slice. No persistence. Cleared after `completeOnboarding` is called.

```ts
interface OnboardingState {
  goalTitle: string;            // Screen 2 answer; empty string if skipped
  focusArea: FocusArea | null;  // Screen 3 selection; null if skipped
  identitySelections: string[]; // Screen 4 selections (up to 3)
  setGoalTitle: (title: string) => void;
  setFocusArea: (area: FocusArea | null) => void;
  setIdentitySelections: (selections: string[]) => void;
  reset: () => void;
}

type FocusArea = 'health' | 'career' | 'creativity' | 'learning' | 'relationships' | 'finances';
```

---

## Navigation — `app/onboarding/_layout.tsx`

Stack navigator, no visible header. Replaces the old single-file `app/onboarding.tsx` (delete that file).

Screens and back/skip rules:

| Screen | File | Back | Skip |
|---|---|---|---|
| welcome | `welcome.tsx` | no | no |
| commitment | `commitment.tsx` | yes | yes — top-right text link |
| focus-area | `focus-area.tsx` | yes | yes — top-right text link |
| daily-identity | `daily-identity.tsx` | yes | yes — top-right text link |
| recommendations | `recommendations.tsx` | **no** | n/a — commitment moment |

Update `app/index.tsx` redirect from `href="/onboarding"` to `href="/onboarding/welcome"`.

---

## Screens

### Screen 1 — Welcome (`welcome.tsx`)

- Logo centered, generous whitespace
- Headline: `"Most people have a graveyard of abandoned goals."`
- Subtext: `"This is where goals actually get done."`
- Single button: `"Let's start"` → navigate to `commitment`
- No skip option

### Screen 2 — Commitment (`commitment.tsx`)

- Minimal layout. Large text input field.
- Prompt: `"What's one thing you've been putting off?"`
- Subtext: `"That's where we start."`
- Validation: required, minimum 3 characters (only enforced on button tap, not while typing)
- Button label: `"That's it"`
- Skip link (top right): navigates to `focus-area` with `goalTitle` left empty
- On `"That's it"`: write `goalTitle` to `onboardingSlice`, navigate to `focus-area`

### Screen 3 — Focus Area (`focus-area.tsx`)

- Single select. Large tappable cards.
- Prompt: `"What area of your life needs the most attention right now?"`
- Options: Health · Career · Creativity · Learning · Relationships · Finances
- No minimum selection required
- Button: `"That's my focus"` (enabled when one card is selected)
- Skip link: navigates to `daily-identity` with `focusArea` left null
- On confirm: write `focusArea` to slice, navigate to `daily-identity`

### Screen 4 — Daily Identity (`daily-identity.tsx`)

- Multi-select, pick up to 3. Selecting a 4th deselects the oldest pick.
- Prompt: `"How do you want to show up every day?"`
- Subtext: `"Pick up to 3. You can always change these."`
- Options and mark mappings:

| Option label | Recommended mark |
|---|---|
| Sleep better | Sleep |
| Move my body | Workout |
| Drink more water | Water |
| Read consistently | Reading |
| Plan my days | Planning |
| Practice focus | Focus |
| Build a skill | Practice |
| Track my finances | Finance |

- Button: `"These feel right"` (enabled when ≥1 card selected)
- Skip link: navigates to `recommendations` with empty `identitySelections`
- On confirm: write `identitySelections` to slice, navigate to `recommendations`

### Screen 5 — Recommendations (`recommendations.tsx`)

No back button. No skip. Two parts on one screen.

**Part A — Mark recommendations**

- Header: `"Here's what we'd suggest for you."`
- Show 2–3 mark cards from `getRecommendedMarks(identitySelections, focusArea)`
- If `identitySelections` is empty (all skipped): omit cards, show quiet fallback line instead: `"You can add marks anytime from home."`
- Each card: icon, mark name, identity label
- User can deselect any card. Cannot add more here.

**Part B — First goal**

- Below marks section
- Label: `"Your first goal"`
- Pre-filled editable text input with `goalTitle` from slice (empty if Screen 2 was skipped)
- If empty, show placeholder: `"What's one thing you want to finish?"`

**CTA button:** `"Start Livra"` — full width, accent color, always enabled (zero marks + empty goal is a valid completion — user can add marks and goals from home).

On tap:
1. Create selected marks (skips silently if name already exists)
2. If goal input is non-empty (≥3 chars): create goal with status `active`
3. Call `completeOnboarding(userId, { focusArea, completedAt: now })`
4. Call `onboardingSlice.reset()`
5. Navigate to `/(tabs)/home`

If goal input is empty on tap: create marks only, skip goal creation. User can add a goal from home.

**Error handling:** If any creation step fails (network error, Supabase timeout, etc.), surface a single retry toast. Do not navigate to home until all steps complete successfully or are explicitly skipped due to empty input. The button should show a loading state during the async operations.

---

## `lib/onboarding/markRecommendations.ts`

```ts
type FocusArea = 'health' | 'career' | 'creativity' | 'learning' | 'relationships' | 'finances';

interface MarkTemplate {
  name: string;
  identity_label: string;
  icon: string;           // emoji
  default_color: string;
  health_kit_type: string | null;
}

function getRecommendedMarks(
  selections: string[],   // Screen 4 option labels
  focusArea: FocusArea | null
): MarkTemplate[]
```

**Rules:**
- If `selections` is empty: return `[]`
- Map each selection to its `MarkTemplate` (static lookup table)
- If ≤ 3 selections: return all
- If > 3 selections: apply focus area priority matrix to pick 3. If `focusArea` is null, return first 3 in selection order.

**Focus area priority matrix** (mark names in priority order):

| Focus area | Priority marks |
|---|---|
| health | Sleep, Workout, Water |
| career | Focus, Planning, Practice |
| creativity | Practice, Focus, Sleep |
| learning | Reading, Practice, Focus |
| relationships | *(no override — keep selection order)* |
| finances | Finance, Planning |

Priority algorithm: score each selected mark by its position in the focus area priority list (earlier = higher priority). Ties broken by selection order. Return top 3.

**Mark template table:**

| Selection | Name | Identity label | Icon | Color | HealthKit type |
|---|---|---|---|---|---|
| Sleep better | Sleep | Recovery | 🌙 | #7B9EA6 | sleep |
| Move my body | Workout | Strength | 💪 | #8A7E6B | workout |
| Drink more water | Water | Vitality | 💧 | #6B9E8A | null |
| Read consistently | Reading | Growth | 📚 | #8A6B7B | null |
| Plan my days | Planning | Clarity | 🗓️ | #9E8A6B | null |
| Practice focus | Focus | Focus | 🎯 | #8A9E8A | null |
| Build a skill | Practice | Mastery | ⚡ | #7B6B9E | null |
| Track my finances | Finance | Discipline | 💰 | #9E7B6B | null |

---

## `uiSlice.ts` — `completeOnboarding` update

Extend the function signature to accept optional metadata:

```ts
completeOnboarding: (
  userId?: string,
  meta?: { focusArea?: string; completedAt?: string }
) => Promise<boolean>
```

When `meta` is provided, include `onboarding_focus_area` and `onboarding_completed_at` in the Supabase `profiles` update. Existing callers pass no `meta` and are unaffected.

---

## Integration — `app/index.tsx`

Change the onboarding redirect:

```ts
// Before
return <Redirect href="/onboarding" />;

// After
return <Redirect href="/onboarding/welcome" />;
```

---

## Files to Delete

- `app/onboarding.tsx` — replaced by folder. Keep as reference during implementation, delete before PR.

---

## Out of Scope

- Mark recommendations for custom marks (user-defined marks are post-onboarding)
- Analytics events for onboarding funnel steps
- A/B testing of onboarding copy
- Re-onboarding (if user resets account)
