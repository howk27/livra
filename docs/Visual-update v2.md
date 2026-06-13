Task 10 — Progress Banner: Glassmorphism
PRIORITY — The green-on-green issue makes the Focus tab unreadable in dark mode. Fix this before anything else visual.
ISSUE DIAGNOSED FROM SCREENSHOT
The compact progress banner uses background: colors.forest (#1F3C34) on a dark mode background of #1B2B27. The contrast ratio is near 1:1 — the banner is invisible. In light mode it works fine but is plain.
DECISION
Replace the solid forest background with a glassmorphism treatment that works on both light and dark backgrounds. This also adds the visual sophistication the app is missing.
GLASS BANNER IMPLEMENTATION
expo-blur is already in package.json as a dependency of Expo. Verify before using: grep "expo-blur" package.json
Use BlurView from expo-blur as the banner container background:
import { BlurView } from "expo-blur";
BlurView props:
• intensity={18} on light mode
• intensity={28} on dark mode (read from useEffectiveTheme)
• tint="default" on light, tint="dark" on dark
• style: borderRadius 16, overflow "hidden", border 0.5px rgba(255,255,255,0.15)
Overlay a semi-transparent color on top of the blur:
• Light mode overlay: rgba(28, 60, 52, 0.08) — very light forest tint
• Dark mode overlay: rgba(141, 181, 168, 0.08) — very light mint tint
Banner content (unchanged from Task 2):
• Left: progress fraction in DMSans_700Bold 20px — white on dark, forest on light
• "marks" label DMSans_400 12px below — inkInverseMuted on dark, inkMuted on light
• Right: ⚡ icon + "N day streak" DMSans_500 13px — mint (#8DB5A8) on both modes
THE BIG NUMBER SPECIAL CASE
You noted the large main pill number should use the "fancy" (serif) font. Apply this rule to the fraction in the banner only:
• The "3/5" fraction inside the glass banner uses LibreBaskerville_700Bold at 26px
• "marks" label and streak text stay DM Sans
• All other stat numbers (strip, tiles elsewhere) stay DM Sans per Task 1
This creates a deliberate hierarchy: the banner is the emotional read (serif = meaning), the strip below is the data read (sans = information).
FALLBACK IF EXPO-BLUR UNAVAILABLE
If BlurView causes a build issue, fall back to:
• Light: rgba(28, 60, 52, 0.10) with borderWidth 0.5 rgba(28,60,52,0.15)
• Dark: rgba(141, 181, 168, 0.12) with borderWidth 0.5 rgba(141,181,168,0.15)
FILES TO UPDATE
• app/(tabs)/focus.tsx — wrap banner in BlurView
• components/ui/ProgressBanner.tsx — if extracted as a component
feat(focus): glass banner with blur and serif fraction number


Task 11 — Email Mark: Fix Broken Icon
Separate from Task 6 (removing email from suggestions). This fixes the broken icon for users who already have the Email mark created.
ISSUE DIAGNOSED FROM SCREENSHOT
The Email mark shows an empty grey circle instead of an icon. The MailCounterIcon exists in IconRegistry but the icon is not resolving. This is likely a CounterIcon component failing silently when the icon type does not match its resolver.
DIAGNOSIS STEPS — CLAUDE CODE MUST RUN THESE FIRST
grep -r "email" src/components/icons/IconRegistry.ts
grep -r "email" src/components/icons/IconResolver.ts
grep -r "resolveCounterIconType" --include="*.tsx" .
Check whether the email mark's stored emoji ("📧") is being passed correctly to CounterIcon vs the type string "email". The resolver may be receiving the emoji but expecting the type string, or vice versa.
FIX
• In IconResolver.ts: ensure "email" type string maps correctly to MailCounterIcon
• In MarkRow / mark list: confirm the icon prop passed to CounterIcon is the type string, not the emoji
• If the email emoji "📧" is being stored but the component expects a type: add emoji→type fallback mapping in the resolver
• Do not change any mark data or state — visual fix only
FILES TO UPDATE
• src/components/icons/IconResolver.ts — verify email mapping
• src/components/icons/IconRegistry.ts — verify MailCounterIcon registration
fix(icons): resolve broken email mark icon in CounterIcon component


Task 12 — Gear Button: Fix Z-Index
ISSUE DIAGNOSED FROM SCREENSHOT
The settings gear button (floating circle, top-right) is appearing on top of mark rows in the list. It has an elevated zIndex that causes it to overlap scrollable content as the user scrolls down. Visible in the screenshot: gear overlaps the Planning mark row.
FIX
• Find where the gear button is rendered — likely a position:absolute element in focus.tsx or a shared layout
• Confirm its zIndex. It should be below any sheet or overlay zIndex but it must not overlap list content
• Correct fix: ensure the gear button is inside the screen's non-scrollable header area, not floating over the ScrollView
• If it must remain absolutely positioned: constrain its top value to stay within the safe area header, not scroll with or over the list
• Do not change the gear button's visual style, size, or navigation behavior
FILES TO UPDATE
• app/(tabs)/focus.tsx — check gear button positioning
• app/(tabs)/queue.tsx — same check (gear appears there too per screenshot)
fix(layout): constrain gear button to header — prevent overlap with scrollable content


Task 13 — FAB Position: Lift Above Tab Bar
ISSUE DIAGNOSED FROM SCREENSHOT
The FAB (+) button is positioned too close to the tab bar — it appears partially behind it. The bottom offset is insufficient on devices with a home indicator (iPhone X and later).
FIX
Update the FAB's bottom positioning to account for the safe area inset:
import { useSafeAreaInsets } from "react-native-safe-area-context";
const insets = useSafeAreaInsets();
// FAB bottom = tabBarHeight + safeAreaBottom + 16px breathing room
bottom: 64 + insets.bottom + 16
The tab bar height is approximately 48px (icon + label). Add the safe area bottom inset (typically 34px on iPhone with home indicator) plus 16px clearance. Total: ~98px from screen bottom on modern iPhones.
• Apply to SpeedDialFAB.tsx — update the bottom style value
• Test: FAB should float clearly above the tab bar with visible space between them
• This same fix applies on both Focus and Queue tabs
FILES TO UPDATE
• components/ui/SpeedDialFAB.tsx — update bottom offset with safe area insets
• components/ui/FAB.tsx — same if FAB is a separate component
fix(fab): lift FAB above tab bar using safe area insets


Task 14 — Queue Tab: Fix Copy, Spacing, Layout
ISSUES DIAGNOSED FROM SCREENSHOT
• "LIVRA" wordmark positioned too low — large gap between status bar and content start
• "Guided Task Progress" — stale v1 copy, must be removed
• "Your sequential path to achieving goals." — stale v1 subhead, must be removed
• Empty state (no goals yet) has excessive vertical gaps between elements
• Overall spacing feels broken — misaligned and inconsistent
COPY CHANGES
Remove "Guided Task Progress" and "Your sequential path to achieving goals." entirely. These are v1 counter-tracking copy and contradict Livra's current positioning.
Queue tab header should read simply:
• Wordmark: "L I V R A" — keep existing letter-spaced style, move to correct position
• Below wordmark: one line only — "Your goals, one at a time." — LibreBaskerville_400Italic 16px, inkMuted
• No other header copy
SPACING FIXES
Queue tab layout (top to bottom with correct spacing):
SafeAreaView top padding: 0
Wordmark row: paddingTop 8px, paddingHorizontal 20px
"Your goals, one at a time." line: marginTop 4px, marginBottom 24px
Section label "YOUR QUEUE": marginBottom 12px
Empty state: centered vertically in remaining space
Empty state content when no goals exist:
• Livra logo mark (calligraphic L) — 32px, inkMuted opacity 0.4
• "No goals yet." — LibreBaskerville_700Bold 22px, inkDark
• "Add your first goal to begin." — DMSans_400 14px, inkMuted, marginTop 8px
• No extra margins or padding beyond the above
WHEN GOALS EXIST — LAYOUT SPEC
Once goals are added, the queue renders:
• Section label "ACTIVE" — 1 active goal card
• Section label "WAITING" — remaining queued goals with drag handles
• Section label "COMPLETED" — collapsed by default, tap to expand
Active goal card: keep existing forest card with left dusty rose border. This is the strongest element on the screen — do not change it.
FILES TO UPDATE
• app/(tabs)/queue.tsx — remove stale copy, fix spacing, fix wordmark position
fix(queue): remove stale copy, fix spacing and wordmark position


Final Checklist
After all 14 tasks are committed:
• npm test — all tests passing
• npm run type-check — zero errors
• npx expo-doctor — no errors
• AUDIT_LOG.md updated with Phase 7.5 summary
• No new libraries added without approval (expo-blur is pre-existing — ok)
• New Architecture remains disabled
• No touches to protected files


Design Token Reference
Token
Value
Usage
colors.forest
#1F3C34
FAB, active states, log button — NOT banner bg anymore
colors.linen
#EAE6DF
All light mode screen backgrounds
dark bg
#1B2B27
Dark mode screen background
Glass overlay light
rgba(28,60,52,0.08)
Banner tint on linen bg
Glass overlay dark
rgba(141,181,168,0.08)
Banner tint on dark bg
colors.mint
#8DB5A8
Streak text, progress fills, checkmarks on dark
colors.accent
#C47E8A
Left border on active goal card only
colors.inkMuted
#9A9A92
Labels, metadata, empty state text
colors.borderLight
#E0DBD4
Dividers, strip cell dividers
Serif — display only
LibreBaskerville_700Bold
Banner fraction, goal/mark names 20px+, screen titles
Sans — everything else
DMSans_400/500/600
All UI, all numbers except banner fraction

Livra UI Overhaul Spec · Phase 7.5 v2 · Sierra Link LLC · June 2026
