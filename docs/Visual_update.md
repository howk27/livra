Livra
UI Overhaul Spec — Phase 7.5
June 2026  ·  Sierra Link LLC  ·  For Claude Code execution


Overview
This document captures the UI improvements to be applied to the Livra codebase immediately following Phase 7. Each section is scoped to a specific screen or component, includes the diagnosis, the decision, and precise implementation instructions for Claude Code.
Ground truth for this spec: screenshots taken directly from the device running the current build, plus project knowledge files reviewed in session.


Ground Rules
These apply to every task in this document. Claude Code must not deviate from them.
• Never touch: state/, lib/db/, lib/goalLogic.ts, hooks/useCounters.ts, supabase/
• All animations via react-native-reanimated only — never Animated from core RN
• No new third-party libraries without checking package.json first
• TypeScript strict — no any types
• Run npm test after every task. All tests must pass before moving on
• Document all changes in AUDIT_LOG.md
• New Architecture remains disabled


Task 1 — Number Typography
ISSUE
Stat numbers across the app (stat tiles, mark detail tiles, streak counts) use Libre Baskerville or Georgia — a serif display font. This makes data feel decorative and hard to read at a glance. Numbers are functional, not editorial.
DECISION
All numeric values switch to DM Sans. Headings and the greeting line keep Libre Baskerville. The rule: serif = voice/emotion, sans = data/UI.
Typography authority table
Element
Font
Weight
Stat tile numbers
DMSans_600SemiBold
600, 32px
Mark detail tile numbers
DMSans_600SemiBold
600, 28px
Hero card 3/5
DMSans_700Bold
700, 40px
Streak count in hero
DMSans_700Bold
700, 32px
Screen greeting line
LibreBaskerville_400Italic
italic, 19px — KEEP
Goal/mark names (20px+)
LibreBaskerville_700Bold
700 — KEEP
All UI below 20px
DMSans_400Regular
400/500 — unchanged

FILES TO UPDATE
• components/ui/StatTile.tsx — tile number style
• app/(tabs)/focus.tsx — hero card numbers
• app/mark/[id].tsx — TODAY / ALL TIME tile numbers
HOW TO FIND EVERY INSTANCE
grep -r "LibreBaskerville\|fontFamily.*serif\|Georgia" --include="*.tsx" --include="*.ts" .
Replace every numeric display TextRun that uses a serif family with DMSans_600SemiBold or DMSans_700Bold per the table above. Do not change any non-numeric text.
COMMIT
fix(typography): switch all numeric displays from serif to DM Sans


Task 2 — Focus Tab: Collapse Stat Tiles
ISSUE
The 2x2 grid of stat tiles (TODAY / STREAK / THIS WEEK / GOALS) consumes roughly 40% of the viewport before the user reaches their marks. Each tile has a large number top-right, an icon top-left, and an empty body — the space communicates nothing. The Focus tab should feel immediate: open the app, see your marks.
DECISION
Replace the 2x2 grid with a single horizontal compact strip. One row, four values, no wasted height. The hero card (TODAY'S PROGRESS) is also compressed: it becomes a slim banner showing the fraction and streak inline, not a tall card.
New layout hierarchy (top to bottom)
• Logo mark + gear button (existing)
• Greeting line (existing, keep)
• Compact progress banner — replaces hero card
• Compact stat strip — replaces 2x2 grid
• YOUR MARKS section label
• Mark rows (existing)
COMPACT PROGRESS BANNER SPEC
Height: 56px (was ~140px)
Background: colors.forest (#1F3C34)
Border radius: 14px
Left side: "3/5 marks" — number in DMSans_700Bold 20px, label in DMSans_400 12px, color inkInverseMuted
Right side: lightning icon + "1 day streak" — DMSans_500Medium 13px, color #8DB5A8
No progress bar inside the banner — remove it

COMPACT STAT STRIP SPEC
Layout: single horizontal row, 4 equal columns
Height: 44px total including padding
Background: transparent (sits on linen bg)
Each cell: number in DMSans_600SemiBold 16px + label in DMSans_400 10px below, centered
Dividers: 0.5px vertical line in borderLight between cells
Values: TODAY count · STREAK days · THIS WEEK count · GOALS active
No icons, no cards, no shadows — just the numbers and labels

FILES TO UPDATE
• app/(tabs)/focus.tsx — replace HeroCard and StatTile grid with new components
• components/ui/StatTile.tsx — add a compact variant prop or replace entirely
COMMIT
feat(focus): replace 2x2 stat grid with compact progress banner and stat strip


Task 3 — Check-in Button: + to ✓ Animation
ISSUE
The mark check circle uses a static checkmark. No feedback, no moment of satisfaction. The check-in is the core daily interaction — it deserves animation.
DECISION
Replace the static circle with a three-state animated button: default (+), animating (spinning), checked (✓). Uses Reanimated only.
THREE STATES
State
Visual
Trigger
Default
Circle border, + icon inside, DMSans 18px, inkMuted color
Idle
Animating
Circle spins 360° via Reanimated withTiming 300ms, + fades out
On tap
Checked
Circle fills forest green, ✓ icon fades in, mint color #8DB5A8
After spin completes

ANIMATION IMPLEMENTATION
const rotation = useSharedValue(0);
const opacity = useSharedValue(1);
const scale = useSharedValue(1);


// On press:
rotation.value = withTiming(360, { duration: 300 }, (finished) => {
  if (finished) runOnJS(onCheckin)();
});
scale.value = withSequence(withTiming(0.88, {duration:120}), withSpring(1));
Add haptic: expo-haptics Haptics.impactAsync(ImpactFeedbackStyle.Light) on press via runOnJS.
FILES TO UPDATE
• components/ui/MarkRow.tsx — replace static check circle with CheckinButton component
• components/ui/CheckinButton.tsx — create new component with above animation logic
COMMIT
feat(checkin): animate + to checkmark with spin transition on mark log


Task 4 — FAB Visibility: Hide on Creation Screens
ISSUE
The SpeedDialFAB renders on every tab screen via the tab layout, including when the AddMarkSheet or AddGoalSheet is open. This is visually cluttered and logically wrong — you should not be able to open a new mark sheet while already inside one.
DECISION
Hide the FAB whenever a bottom sheet is open. The FAB's visibility is already controlled by a Zustand store or local state — add a condition that reads the sheet's open state.
IMPLEMENTATION
• Identify where SpeedDialFAB renders — likely app/(tabs)/_layout.tsx or each tab screen
• Identify the state that controls AddMarkSheet / AddGoalSheet visibility (AddMarkSheetStore or similar)
• Add: if (addMarkSheetOpen || addGoalSheetOpen) return null inside SpeedDialFAB render
• Also hide on mark detail screen (app/mark/[id].tsx) — user is already in a mark context
// In SpeedDialFAB.tsx:
const addMarkOpen = useAddMarkSheetStore(s => s.isOpen);
const addGoalOpen = useAddGoalSheetStore(s => s.isOpen);
if (addMarkOpen || addGoalOpen) return null;
FILES TO UPDATE
• components/ui/SpeedDialFAB.tsx — add sheet-open guard
• app/mark/[id].tsx — confirm FAB is not rendered on this screen
COMMIT
fix(fab): hide SpeedDialFAB when AddMark or AddGoal sheet is open


Task 5 — Apple Health: Move to Settings
ISSUE
The Apple Health integration card currently lives inside each mark's detail screen. This is architecturally wrong — Health is a system-level integration, not a per-mark setting. Showing it per-mark is confusing and creates repetition.
DECISION
Remove the Apple Health card from mark/[id].tsx. Add an Integrations row to the Settings tab that navigates to a new app/settings/integrations.tsx screen.
NEW INTEGRATIONS SCREEN SPEC — APP/SETTINGS/INTEGRATIONS.TSX
Header: "Integrations" — nav title style
Section: "Health"
• Apple Health row: heart icon in pink tile, "Apple Health", subtitle "Auto-log sleep, workouts & steps", Connect/Connected badge on right
• On tap: existing HealthKit connection logic (move from mark detail — do not duplicate)
Section: "Coming Soon" (muted)
• Google Fit — muted, "Coming soon" badge
• Garmin — muted, "Coming soon" badge

MARK DETAIL SCREEN CHANGES
• Remove the Apple Health integration card from app/mark/[id].tsx entirely
• Remove the Daily reminder card from mark detail — this belongs in the per-mark settings section within the detail screen but styled consistently, not as a standalone card
SETTINGS SCREEN CHANGES
• Add "Integrations" row to the first settings group (Notifications, Appearance, Privacy & Security)
• Use the plug/link Phosphor icon
• Navigate to /settings/integrations
FILES TO UPDATE
• app/mark/[id].tsx — remove Apple Health card
• app/settings/integrations.tsx — create new screen
• app/(tabs)/settings.tsx — add Integrations row
• app/_layout.tsx — register /settings/integrations route if not auto-registered
COMMIT
feat(settings): move Apple Health integration from mark detail to Settings > Integrations


Task 6 — Email Mark: Remove as Default Suggestion
ISSUE
Email appears in the suggested marks list with a mail icon. The icon works, but Email is not a meaningful daily identity mark — "I am someone who checks email" is not a goal execution behavior. It was likely a legacy counter from v1.
DECISION
Do not delete the email type from the icon registry or MARK_LIBRARY — existing users who have it should not break. Remove it from the suggested marks list (SuggestedCountersList / SUGGESTED_COUNTERS_BY_CATEGORY) so it no longer appears as a recommendation to new users.
IMPLEMENTATION
// In lib/suggestedCounters.ts:
// Find the email entry in SUGGESTED_COUNTERS_BY_CATEGORY
// Remove it from the array — do not delete the type or icon
• Search: grep -r "email" lib/suggestedCounters.ts
• Remove only the email entry from the suggestions array
• Do not touch: MARK_LIBRARY exports, IconRegistry, ICON_TYPE_TO_EMOJI, or any state/db files
FILES TO UPDATE
• lib/suggestedCounters.ts — remove email from suggestions
COMMIT
fix(marks): remove email from suggested marks list


Task 7 — Add Mark Screen: Give It Life
ISSUE
The Add Mark screen is a plain form: text input + category picker + target stepper. It has no warmth, no guidance, and no sense that creating a mark is a meaningful act. It feels like filling out a database form.
DECISION
Keep the existing form logic intact. Upgrade the visual presentation: better hierarchy, a subtle motivational copy line, and cleaner spacing. This is a layout and copy change — not a logic change.
UPDATED LAYOUT SPEC
Top of sheet (above form fields):
• Sheet handle (existing)
• Large serif headline: "What will you do every day?" — LibreBaskerville_700Bold, 24px
• Subtext: "Pick something small enough to start today." — DMSans_400, 14px, inkMuted

Suggested marks grid (existing SuggestedCountersList):
• Keep existing grid — it is working and has good data
• Add a section label above it: "POPULAR MARKS" in uppercase tracked style
• Selected state: forest green border 1.5px + light forest tint background

Custom name input (when user types a custom name):
• Field label: "OR CREATE YOUR OWN"
• Input placeholder: "Name your mark..."
• Below input, show identity preview: "I am someone who ___" with the mark name appended — DMSans_400 italic 13px, inkMuted
• This preview updates live as the user types

CTA button:
• Full width, forest green, rounded pill: "Add this mark"
• Disabled state when no mark selected/named: reduced opacity 0.4
• On press: existing createMark logic unchanged

FILES TO UPDATE
• components/sheets/AddMarkSheet.tsx — layout and copy only, no logic changes
COMMIT
feat(addmark): upgrade sheet layout with hierarchy and identity preview


Task 8 — Add Goal Screen: Give It Purpose
ISSUE
The Add Goal sheet is a form with five fields stacked vertically. No context, no sense of weight. Creating a goal is the most meaningful action in Livra — the UI should match that.
DECISION
Restructure the sheet into two visual zones: an intent zone at the top (goal name + why) and a mechanics zone below (target, deadline, linked marks). Add copy that gives the interaction gravity without being heavy-handed.
UPDATED LAYOUT SPEC
Zone 1 — Intent (top, no label):
• Serif headline: "New Goal" — LibreBaskerville_700Bold, 28px
• Subtext below: "What does finishing this make possible?" — DMSans_400 italic 14px, inkMuted
• GOAL NAME field: large, prominent. Placeholder: "Run a marathon..." — DMSans_500, 17px
• YOUR WHY field: smaller, below. Placeholder: "What will finishing this change?" — DMSans_400, 15px

Visual divider between Zone 1 and Zone 2: thin borderLight horizontal rule, 24px vertical margin

Zone 2 — Mechanics (labeled):
• Section label: "HOW IT WORKS"
• COMPLETION TARGET stepper — existing logic, unchanged
• DEADLINE toggle + date picker — existing logic, unchanged
• LINKED MARKS — existing logic, unchanged
• Section label above linked marks: "WHICH MARKS FEED THIS?"

CTA:
• "Add to queue" — full width, forest green pill
• Disabled until goal name is non-empty

FILES TO UPDATE
• components/sheets/AddGoalSheet.tsx — layout and copy only, no logic changes
COMMIT
feat(addgoal): restructure sheet into intent + mechanics zones


Task 9 — Mark Detail: Remove Clutter, Add Clarity
ISSUE
The mark detail screen has four distinct cards/sections competing for attention: two stat tiles, a log button, undo/reset links, feeding into section, history list, today's note card, Apple Health card, and daily reminder card. It is overwhelming and most of it is low-value real estate.
DECISION
Simplify to three clear zones. Remove Apple Health (moved to Settings — Task 5). Tighten the stat tiles. Make the log button the visual center.
NEW THREE-ZONE LAYOUT
Zone 1 — Identity (top):
• Category icon in circle (existing)
• Mark name in LibreBaskerville_700Bold, 28px — keep serif here, this is a name not data
• Identity label below name (if set): DMSans_400 italic 14px, inkMuted

Zone 2 — Today action (center, visual hero):
• Compact stat row: TODAY count · ALL TIME count — side by side, DMSans_600 20px, not large tiles
• Log button: full-width pill, 56px height
•   - Default: "Log today" — forest bg, inkInverse text
•   - Logged: "Logged today ✓" — surfaceAlt bg, inkMuted text, dusty rose checkmark
• Undo and Reset today: small inline text links below button, centered

Zone 3 — Context (below the fold):
• FEEDING INTO — existing logic
• HISTORY — existing list, keep as-is
• TODAY'S NOTE — keep card, it is useful
• DAILY REMINDER toggle — keep here, it is mark-specific
• Apple Health — REMOVE (moved to Settings)

STAT ROW SPEC (REPLACES TWO BIG TILES)
Single horizontal row, two values centered:
[ ✓  1 today ]   |   [ ✓  3 all time ]
Font: DMSans_600SemiBold 20px for number, DMSans_400 12px for label. Divider between them: borderLight.
FILES TO UPDATE
• app/mark/[id].tsx — restructure layout, remove Apple Health card
COMMIT
feat(markdetail): simplify to three zones, compact stat row, remove Apple Health card


Final Checklist
After all 9 tasks are committed individually:
• npm test — all tests passing
• npm run type-check — zero errors
• npx expo-doctor — no errors (warnings acceptable)
• AUDIT_LOG.md updated with Phase 7.5 summary
• No new libraries added without approval
• New Architecture remains disabled
• No touches to protected files


Design Token Reference
For completeness — these are the canonical values Claude Code should use throughout all tasks above.
Token
Hex
Usage
colors.forest
#1F3C34
FAB, hero card bg, log button, active states
colors.linen
#EAE6DF
All screen backgrounds (light mode)
colors.surface
#FFFFFF / #FAF9F7
Cards, tiles
colors.surfaceAlt
#F5F2EC
Muted tiles, inactive
colors.mint
#8DB5A8
Progress fills, checkmarks on dark
colors.accent
#C47E8A
Dusty rose — check-in button logged state only
colors.inkDark
#1A1A18
Primary text
colors.inkMuted
#9A9A92
Labels, placeholders, metadata
colors.borderLight
#E0DBD4
Dividers, tile borders

Livra — UI Overhaul Spec · Phase 7.5 · Sierra Link LLC · June 2026
