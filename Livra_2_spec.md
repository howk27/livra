# LIVRA 2.0 — Complete Design & Engineering Spec
> Hand this document to Claude Code. Read every section before touching any file.

---

## What Livra 2.0 Is

Livra is not a habit tracker. It is a **daily mirror that reflects who you're becoming.**

Every session is a reflection. Every mark logged is a data point in an emerging self-portrait. The calendar heatmap is the portrait. The Momentum number is the evidence. The title on the profile is the verdict. The language is a voice — spare, honest, specific — that describes what it sees.

The person who loves this app doesn't open it to track habits. They open it to **check in with themselves.**

**The emotional engine is: identity + tension resolution.**
Not curiosity (that's a feed). Not entertainment. The user wants to become a certain type of person and feel the daily evidence of that becoming.

---

## Design Language — Non-Negotiables

These rules apply to every screen, every component, every string of copy.

### Visual tone
- Dark, rich backgrounds — not flat black, but deep forest green/charcoal (the current palette is correct, keep it)
- Accent colors are earned signals: blue = workouts, orange/amber = steps, green = sleep. These colors appear at full saturation only when a mark is logged. Unlogged = muted/desaturated.
- No confetti, no badge popups, no generic celebration animations. Ceremony is achieved through stillness, not noise.
- Gradients are subtle and purposeful — glow effects only on streaks and completion states.
- Typography: current sizing hierarchy is fine. The emotional weight comes from copy, not font changes.

### Copy voice — strict rules
1. **Short.** Nothing over 8 words unless it's a rare narrative moment.
2. **Specific.** Never "great job." Always "Day 8." Never "you're doing well." Always "You've never missed a Wednesday."
3. **Honest.** Never pretend consistency is easy. Never shame absence.
4. **Spare.** When something matters, say less. Restraint signals respect.
5. **Never generic motivational.** "You've got this!" must never appear. "Every journey starts with a single step" must never appear.

### Animation principles
- Every animation uses `react-native-reanimated` (already installed, v4.1.1).
- Spring animations for physical interactions (tap, press, bounce).
- Timing animations for state transitions (fill, fade, morph).
- All animations complete within 600ms unless they are deliberate ceremony (max 4 seconds for the 3/3 completion sequence).
- Idle/ambient animations (breathing pulse) are very slow: 3–4 second cycles at very low scale magnitude (1.0 → 1.04).
- `expo-haptics` fires on every mark log. `ImpactFeedbackStyle.Heavy` for regular logs. `NotificationFeedbackType.Success` for 3/3 completion.

---

## Layer 1 — The Home Screen

### Header (replaces static "Daily Momentum")

The header is a **living statement** of where the user is right now. It changes based on time of day + day of week + streak status + logged count. It is the voice of the app.

Implement a `getDailyHeader(state: AppState): { title: string; subtitle: string }` function in `lib/copy.ts`.

```
State logic (evaluate in order):

All 3 marks done today:
  title: "Done."
  subtitle: "Come back tomorrow."

3/3 done + 7-day streak:
  title: "One week."
  subtitle: "Most people stopped by now."

3/3 done + 30-day streak:
  title: "Thirty days."
  subtitle: "This is rare."

Returning after 3+ day gap (first open after absence):
  title: "You're back."
  subtitle: "That's enough for today."

Monday, nothing logged:
  title: "New week."
  subtitle: "Three marks. Make one count."

Sunday, nothing logged, after 8pm:
  title: "Don't let Sunday slip."
  subtitle: null

Evening (after 7pm), nothing logged, streak active 5+ days:
  title: "Still tonight."
  subtitle: null   ← brevity = urgency

2/3 logged:
  title: "Almost there."
  subtitle: null

1/3 logged:
  title: "One down."
  subtitle: null

Morning (before noon), nothing logged, streak 1+ days:
  title: "Day {N}."
  subtitle: "You showed up yesterday. Do it again."

Morning, nothing logged, no streak:
  title: "Day's wide open."
  subtitle: null

Afternoon, nothing logged:
  title: "Still time."
  subtitle: null

Default fallback:
  title: "Daily Momentum"
  subtitle: "{N}/3 marks today"
```

The progress bar segments (0/3 → 3/3) stay below the header. They are the only numeric indicator needed — remove "3 marks left today" deficit framing.

### The progress bar segments

Three segments. Each fills with a liquid animation when the corresponding mark is logged (animated from left edge to right edge, 600ms, ease-in-out). Color matches the mark that was just logged, then transitions to the app's primary accent. On 3/3 completion: all three pulse simultaneously (luminosity pulse, not color change) — scale 1.0 → 1.03 → 1.0 over 400ms with a 100ms stagger between segments.

### Week arc strip (replaces "1/7 - keep the week alive")

A single line. Changes based on the day of week and current week performance:

```
Monday:           "Week begins."
Tuesday:          "Day 2 of 7."
Wednesday:        "Halfway."
Thursday:         "Keep it going."
Friday:           "Weekend incoming — the real test."
Saturday:         "The weekend test."
Sunday before 6pm: "One day left."
Sunday after 6pm: "Final call."

Override conditions (checked first):
  Perfect week so far (all days logged to today):  "Perfect week so far. Don't stop."
  6/7 logged (on Sunday):                         "One more. Best week ever."
  0 logged by Thursday:                            "The week isn't over."
```

---

## Layer 2 — The Mark Cards

### Five visual states — implement all of them

**State 1: Unlogged (default)**
- Card opacity: 0.85
- Icon: slow breathing animation. Scale 1.0 → 1.04 → 1.0. Duration: 4000ms. Loop. Easing: ease-in-out.
- Accent color dot: 40% opacity
- The `+` button: present, full opacity

**State 2: Logged today**
- Card opacity: 1.0 (animates up from 0.85 on log, spring)
- Icon: breathing animation stops. Single pop on log event — scale 1.0 → 1.18 → 1.0, spring, ~300ms
- Accent color dot: 100% opacity, full saturation
- A 2px horizontal line at the bottom of the card fills left-to-right in 600ms (accent color)
- The `+` button: morphs to checkmark (see Layer 3 for full animation spec)

**State 3: Streak active (5+ days)**
- Everything from State 2, plus:
- A barely-perceptible gradient border around the card. The mark's accent color at 18% opacity bleeds in at the card edges. Implemented as a slightly colored shadow or border with low opacity — it should feel like warmth behind the card, not a visible border.

**State 4: At risk (after 7pm, unlogged, streak 3+ days active)**
- Card border/shadow shifts to amber — warm, not red. Red is accusatory. Amber is a hand on the shoulder.
- The breathing animation speeds up: 3000ms cycle instead of 4000ms
- No notification fired from within the card — this is purely visual ambient urgency

**State 5: Returning after 3+ day gap (no streak)**
- Card starts at 0.7 opacity
- Breathing is very slow: 5000ms cycle
- On log: opacity animates to 1.0, icon bounce is more expressive than normal (scale to 1.25 instead of 1.18) — this is a return, not a routine log

### Icon redesign

Replace generic SF Symbols with custom SVG icons. Two weight variants per icon: **resting** (thin stroke, ~1.5px) and **active** (same shape, bolder stroke, ~2.5px). The transition between resting → active is a stroke-width animation that occurs during the log tap (200ms).

**Expressive moments on log (play once, 400ms):**
- Dumbbell: slight rotation (±8 degrees, spring back) as if it was just lifted
- Footsteps: alternating opacity on the two footprints (left then right, 150ms each) — two steps in place
- Moon: a small circular sweep animation, the moon completes its arc from one side to the other

These are one-shot animations triggered by logging. They play once and settle into the static active state.

---

## Layer 3 — The Log Tap (Millisecond Spec)

This is the most important interaction in the app. It happens potentially once a day for years.

```
0ms:      Touch begins → card scales down 2% (spring). The + button scales down 8%.
          This responds to touch BEGIN, not touch END.

80ms:     Touch ends → haptic fires: expo-haptics ImpactFeedbackStyle.Heavy
          The + button morphs to checkmark:
            - The vertical bar of the plus shortens to 0
            - Two diagonal lines of a checkmark extend outward
            - Animate via SVG path interpolation or Reanimated path animation
            - 200ms duration

80–300ms: Ripple: a circle expands from the center of the + button.
          Scale 1.0 → 1.4, opacity 1.0 → 0, duration 300ms.
          Color: the mark's accent color at 60% opacity.

300–900ms: The day dot fills. Liquid fill — a circle filling from the bottom up.
           Fill is the mark's accent color. Duration 600ms.
           Simultaneously: the corresponding progress bar segment fills (left to right, same duration).

900ms:    Icon expressive animation plays (see Layer 2 icon spec).

If this is 3/3 (all marks complete):

900ms:    300ms pause. Deliberate silence.

1200ms:   All three header segments pulse (luminosity pulse, 400ms, staggered 100ms each).

1400ms:   Header text dissolves (opacity 1 → 0, 200ms) and reforms (opacity 0 → 1, 200ms) as:
            Line 1: "Done."     (large, primary color)
            Line 2: "Come back tomorrow."  (small, secondary color)

1400ms–4000ms: This state holds. Nothing else happens. No prompts. No buttons.
               The app is complete for the day.

4000ms:   Post-log message fades in at bottom (opacity 0 → 1, 400ms).
          A single line from the message pool (see copy system below).
          Fades out at 6000ms.

Haptic for 3/3 completion: NotificationFeedbackType.Success (distinct from regular log)
```

### Post-log message pool

Implement in `lib/copy.ts`. 25+ messages. Selection is weighted by context. Never the same message twice in a row (store last shown in state).

```typescript
// Context weights — pass current state to getPostLogMessage(state)
// Messages pool (sample — expand to 25+):

const MESSAGES = [
  { text: "Quiet consistency. That's the whole game.", weight: 'default' },
  { text: "Your future self is watching.", weight: 'default' },
  { text: "Most people stopped by now.", weight: 'streak_5plus' },
  { text: "Day {streak}. Still here.", weight: 'streak_any', dynamic: true },
  { text: "One more day would've been your best week.", weight: 'near_miss' },
  { text: "The streak is growing.", weight: 'streak_3plus' },
  { text: "You came back. That's the hardest part.", weight: 'returning' },
  { text: "Show up tomorrow and it becomes a pattern.", weight: 'streak_1' },
  { text: "Nobody sees this work. That's not the point.", weight: 'default' },
  { text: "Slow and steady isn't a consolation. It's the method.", weight: 'default' },
  { text: "You did this yesterday too.", weight: 'streak_2plus' },
  { text: "It gets easier to start. Not to stop.", weight: 'default' },
  { text: "This one mattered.", weight: 'completing_3of3' },
  { text: "The calendar is filling in.", weight: 'default' },
  { text: "Momentum logged.", weight: 'completing_3of3' },
];
```

---

## Layer 4 — The Tracking Screen

### Structure (top to bottom)

1. **Week sentiment header** (full-width, large)
2. **Calendar heatmap** (moved to top — this is the hero visual)
3. **Week day strip** (Mon–Sun current week)
4. **Streak history timeline** (horizontal scroll)
5. **Insight line** (weekly, data-driven)
6. **Stat cards** (best consistency, streak highlight, best day) — currently exist, keep but restyle

### Week sentiment header

Large bold statement. Changes weekly based on performance. Evaluated on Sunday night or Monday morning.

```
7/7 logged:           "Perfect week. This is what it looks like."
5–6/7 logged:         "Strong week. You're building something real."
3–4/7 logged:         "Half measures. You know you can do more."  ← honest, not comforting
1–2/7 logged:         "Rough week. They happen. Monday's a clean slate."
0/7 logged:           "The week slipped. It does sometimes."
After a comeback:     "You came back. That matters more than you think."
```

### Calendar heatmap — hero treatment

Move to the top of the tracking screen. Make it larger. Three visual states per day square:

```
Empty (no log):     Very dark square — almost invisible. Absence should feel absent.
Partial (some marks): Gradient fill from bottom up, 50% fill height. Medium opacity.
Complete (all marks): Full fill. Slight luminosity. Feels warm.
```

On screen entry: calendar squares animate in left-to-right, column by column. 30ms stagger per column. Total reveal ~800ms. Creates the feeling of reading your own history.

On tap of a day: small tooltip slides up. Shows marks logged that day and streak count at that moment. No other information.

### Streak history timeline

Horizontal ScrollView. Every streak shown as a vertical bar, chronological left to right. Bar height proportional to streak length. Bar color: the mark type with the highest consistency.

On tap of a bar: expands slightly, shows date range. "March 4–17. 14 days." Then collapses.

Animate in on scroll into view: bars grow from height 0 to full height with a 30ms stagger.

**The emotional purpose of this component:** It shows that every long streak started as a 1. The 14-day bar began as the little 1-bar to its left. This is a motivating visual truth that no copy can communicate.

### Insight line

One sentence. Generated weekly from SQLite data patterns. Lives below the streak timeline.

```typescript
// Implement in lib/insights.ts
// Query patterns against user's log history:

function getWeeklyInsight(logs: LogEntry[]): string {
  // Pattern 1: Never missed a specific day
  // "You've never missed a Wednesday."

  // Pattern 2: Longest streaks start on a specific day
  // "Your longest streaks all start on Mondays."

  // Pattern 3: One mark is stronger than others
  // "Steps is your strongest mark. Workouts is where you slip."

  // Pattern 4: Best month
  // "April was your best month. What was different?"

  // Pattern 5: Time-of-day consistency (if timestamps stored)
  // "You always log before noon."

  // Pattern 6: Recent trend
  // "You've logged 8 of the last 10 days."

  // Fallback: motivating near-miss
  // "One more day this week would have been your best ever."
}
```

This is NOT an AI feature. It is finite pattern-matching logic against existing SQLite data. The emotional impact comes from specificity.

---

## Layer 5 — The Profile Screen (Identity Surface)

Rethink this screen entirely. It is no longer settings/utility. It is the identity mirror.

### Structure (top to bottom)

1. **Name** (large)
2. **Momentum number** (rolling counter animation on screen entry)
3. **Current title** (earned, silent, single)
4. **Mark lifetime stats** (three lines, clean)
5. **Share card button**

### Momentum number

A purely cumulative count. Every mark ever logged = +1. Streak milestone bonuses:
- Day 7: +7 bonus
- Day 14: +14 bonus
- Day 30: +30 bonus

It never goes down. Never resets. It is the total volume of showing up.

**Display:** Large number. On screen entry, animate from 0 to actual value using an odometer/rolling effect. Duration: 1.5 seconds. Ease-out. After animation settles: static.

**Backfill for existing users:** Calculate from their full log history on first 2.0 launch.

### Titles (silent progression)

Only one title shown at a time. No title collection screen. No announcement when it changes — user notices it themselves.

```
Days 1–6:              "Day One"
First 7-day streak:    "The Streak Starter"
30 total days logged:  "Building Something"
First 14-day streak:   "The Consistent One"
50 total days logged:  "Quiet Force"
100 total days logged: "The Long Game"
First 30-day streak:   "Unstoppable"
200 total days logged: "The Identity"
```

### Mark lifetime stats

```
Workouts    47 logged   Best streak: 8 days
Steps       61 logged   Best streak: 14 days
Sleep       29 logged   Best streak: 5 days
```

Three lines. No dashboard. The numbers growing over months is its own retention mechanic.

### Share card

Button: "Share your momentum."

Generates an image (use react-native-view-shot or equivalent):
- Dark background (app's primary bg color)
- User's current title, large, centered
- Momentum number
- Last 4 weeks heatmap strip (28 squares, 7 per row)
- "LIVRA" wordmark, small, bottom right
- Accent color from most consistent mark

Free feature. No gate. Every share is distribution.

---

## Layer 6 — Onboarding Rewrite

Three screens. Get user to first log in under 60 seconds.

### Screen 1 — The question

Black background. One line of text appears word by word (each word fades in with 100ms delay):

**"What do you keep meaning to do?"**

Below it, three cards slide up from the bottom (staggered, spring animation):
- 💪 Workout
- 👟 Steps
- 🌙 Sleep

User taps one or more. No explanation of "marks." No feature list.

### Screen 2 — The honest frame

After selection. Copy appears line by line with deliberate pauses:

```
"Most people quit by day 4."

[800ms pause]

"You probably will too."

[800ms pause]

"But if you come back on day 5..."

[800ms pause]

"...something starts to change."
```

Single button: **"Start anyway."**

This is intentionally uncomfortable. It acknowledges reality. Users who tap "Start anyway" after reading this are more committed than users who tapped through generic onboarding.

### Screen 3 — The first mark

Home screen appears at 60% opacity, slightly blurred.

Header reads: **"Your first mark is waiting."**

A pulsing arrow (Reanimated, slow bounce) points at the `+` button of the first mark they selected.

They tap it. The full log tap sequence plays (haptic, animation, everything). The card comes to full opacity. The blur lifts. The header changes to "One down."

**This is the entire onboarding.** They learned the app by feeling it work.

---

## Layer 7 — Notification System

**Rule: Never more than one push notification per day. Ever.**

Implement in `lib/notifications.ts`. All notifications are scheduled locally via `expo-notifications`.

```typescript
// Notification types (only one fires per day, priority order):

// 1. Streak protector (highest priority)
// Condition: 8pm, streak 3+ days, not yet logged today
// Text: "Day {N} ends at midnight."
// No emoji. No call to action. Just the fact.

// 2. The Monday hook
// Condition: Every Monday 8am
// Text: "Last week: {N}/7. This week starts now."
// Pull actual last week count from SQLite

// 3. Near-miss preview
// Condition: User is 1 day away from their best-ever week
// Text: "One more today. Best week ever."

// 4. Milestone preview
// Condition: Tomorrow would be a milestone streak day (7, 14, 30)
// Text: "Tomorrow: day {N}."
// Nothing else. Let the weight land.

// 5. Default daily reminder
// Condition: User's chosen reminder time, if none of above fired
// Text: Pull from contextual header copy (same logic as home screen header)
```

---

## Layer 8 — The Ambient Layer

### Widget (if platform supports it)

Home screen widget. Two pieces of information only:
- Current streak number (large)
- Today logged indicator (dot: filled or empty)

That's it. The user glances at their phone and Livra exists in their life. When they see "Day 12" on their home screen at 9pm, they think: I should log before midnight.

### At-risk ambient state (in-app, no notification)

Implemented entirely in the home screen's render logic. No push notification needed.

Conditions:
- Time is after 7pm
- User has an active streak of 3+ days
- No marks logged today

Result: Mark cards show amber-tinted border/shadow (State 4 in Layer 2 card spec). No text changes. No banner. Just the visual temperature of the card shifts. Subliminal.

---

## File Map — Where to Apply Changes

```
lib/copy.ts              ← CREATE NEW. All dynamic copy: headers, messages, insights, week arcs.
lib/insights.ts          ← CREATE NEW. Weekly insight pattern queries.
lib/notifications.ts     ← REWRITE. Implement 5-tier contextual notification system.
lib/momentum.ts          ← CREATE NEW. Momentum calculation, title logic, share card generation.

components/MarkCard.tsx       ← MAJOR REWRITE. All 5 states, breathing animation, log tap sequence.
components/ProgressBar.tsx    ← REWRITE. Liquid fill animation, 3/3 pulse ceremony.
components/HomeHeader.tsx     ← REWRITE (or create). Dynamic copy from lib/copy.ts.
components/CalendarHeatmap.tsx ← REWRITE. Hero treatment, staggered reveal, tap tooltip.
components/StreakTimeline.tsx  ← CREATE NEW. Horizontal bar chart of streak history.
components/MomentumCounter.tsx ← CREATE NEW. Odometer display for profile screen.
components/ShareCard.tsx      ← CREATE NEW. Generate shareable image.

app/(tabs)/home.tsx      ← UPDATE. Use new header, remove deficit framing, ambient state logic.
app/(tabs)/stats.tsx     ← REWRITE. Week sentiment header, calendar to top, new components.
app/(tabs)/profile.tsx   ← REWRITE. Identity surface — Momentum, title, stats, share.
app/onboarding.tsx       ← REWRITE. Three-screen honest onboarding.
```

---

## What 2.0 Is NOT

Do not add these — they are 3.0 conversations:
- Social features / friend comparisons
- AI coaching or Claude integration
- Detailed workout logging (sets, reps, weight)
- Apple Health / Google Fit deep integration
- New mark types
- A redesigned navigation structure
- Gamification elements (points, leaderboards, badges)

2.0 is about making what's already there feel **undeniably good to use**. The soul, not more surface.

---

## Implementation Order

Work in this sequence. Complete each layer before starting the next.

1. `lib/copy.ts` — the copy system. Everything else references this.
2. Mark card states (Layer 2) — visual states only, no animation yet
3. Log tap animation sequence (Layer 3) — the core interaction
4. Home screen header + progress bar (Layer 1)
5. Tracking screen restructure (Layer 4)
6. Profile screen (Layer 5)
7. Onboarding rewrite (Layer 6)
8. Notifications (Layer 7)
9. Share card (Layer 5, end)
10. Widget (Layer 8, if time permits)

---

*End of spec. If anything is ambiguous, default to: less is more. Spare > elaborate. Specific > generic. Honest > comfortable.*