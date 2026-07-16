import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Keyboard,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  themedColors,
  spacing,
  fontSize,
  fontWeight,
  fonts,
  radius,
  borderRadius,
  headerControl,
  headerControlBoxLeading,
} from '../../theme/tokens';
import { applyOpacity } from '../../src/components/icons/color';
import { GoalCardPreview } from '../../components/creation/GoalCardPreview';
import { AIHatchButton } from '../../components/ui/AIHatchButton';
import { PillButton } from '../../components/ui/PillButton';
import { CATEGORY_MAP } from '../../components/ui/MarkRow';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { useSettleEntrance } from '../../hooks/useSettleEntrance';
import { checkProStatus } from '../../lib/iap/iap';
import { GOAL_LIMIT_MESSAGE } from '@/lib/copy';
import { getMarksForGoal } from '../../lib/goalMarkSuggestions';
import { goalPreviewMarks } from '../../lib/creation/creationPreview';
import { CommitmentScreen, CommitmentSelection } from '../../components/CommitmentScreen';
import { MarkDefinition } from '../../lib/suggestedCounters';
import { colorForSuggestedCounter } from '../../lib/markCategory';
import { useDeferredAutoFocus } from '../../hooks/useDeferredAutoFocus';
import { useHalfRenderProbe } from '../../hooks/useHalfRenderProbe';

type Step = 'title' | 'commitment';

// Example goals that seed the title on tap — smart defaults so the screen is
// never a blank box (ux-psychology rule 1). Each is a concrete, real goal that
// getMarksForGoal resolves to a strong mark strip, so a tap immediately shows
// the card "taking shape."
//
// QC4-C: they NO LONGER collapse when a title exists. Gating them on
// `!title.trim()` emptied the screen at the exact moment creation began, and
// left no way to change your mind about a pick except cancelling out of the
// screen and coming back (founder). The bin is permanent, like mark/new's
// Popular marks.
//
// QC5-B: ten, and every one is OUTCOME-shaped — a thing you finish or reach.
// The founder's objection to "Read nightly" ("sounds like a mark, not a goal")
// is a grammar rule, not a one-off: a recurring action IS a mark in this
// product, so offering one as a goal teaches the wrong model on first open.
// "Meditate daily" was dropped for the same reason. The ten also span 8 of the
// 9 library categories, so the bin shows the app's breadth as a welcome.
// Each was verified against the real getMarksForGoal — see
// tests/unit/goalCreationBench.test.ts, which pins the list and re-runs the
// resolution so a library change can never quietly hollow one out.
const EXAMPLE_GOALS = [
  'Run a 5k',
  'Lose 15 pounds',
  'Save $5k',
  'Fix my sleep',
  'Get my stress under control',
  'Learn Spanish',
  'Read 12 books this year',
  'Write a book',
  'Be more present with my family',
  'Launch a side hustle',
];

// QC4-E: the parts bin gets color. Each preset resolves its category from its
// top getMarksForGoal hit, so the chip carries the same accent + duotone glyph
// treatment as mark/new's popular chips — parts, not beige chrome. Pure over a
// module constant, so it resolves once at import rather than per render.
const EXAMPLE_GOAL_PARTS = EXAMPLE_GOALS.map((title) => {
  const top = getMarksForGoal(title)[0];
  const cat = CATEGORY_MAP[top?.category ?? 'custom'] ?? CATEGORY_MAP.custom;
  return { title, accent: cat.accent, Icon: top?.icon ?? cat.Icon };
});

/**
 * One mark tile in the live "what this takes" strip. Settles in on mount
 * (useMotion, reduced-motion static) so newly-matched marks materialize as the
 * title is typed — the surface's one orchestrated motion moment (QC3-A / A1).
 * Category-accent duotone glyph on a low-alpha wash: a quiet preview, never the
 * ember spark and never a loud selection.
 */
function MarkPreviewChip({
  mark,
  labelColor,
  expanded,
  onPress,
}: {
  mark: MarkDefinition;
  labelColor: string;
  expanded: boolean;
  onPress: () => void;
}) {
  // Mount-only entrance; the chip remounts (replaying) when a new mark matches.
  const style = useSettleEntrance(6);

  const cat = CATEGORY_MAP[mark.category] ?? CATEGORY_MAP.custom;
  const Icon = mark.icon ?? cat.Icon;

  return (
    <Animated.View style={style}>
      {/* QC4-B-ui: the chip is the disclosure — a real 44pt touch box (never
          hitSlop, which clips at the parent's bounds), so it is reachable
          one-handed. Expanding tints it up to the mark/new selected weight. */}
      <TouchableOpacity
        testID="goal-mark-preview-chip"
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={mark.name}
        accessibilityHint="Shows what this mark tracks"
        accessibilityState={{ expanded }}
        style={[
          styles.previewChip,
          {
            backgroundColor: applyOpacity(cat.accent, expanded ? 0.14 : 0.1),
            borderColor: applyOpacity(cat.accent, expanded ? 0.45 : 0.3),
          },
        ]}
      >
        <Icon size={18} color={cat.accent} weight="duotone" />
        <Text style={[styles.previewChipLabel, { color: labelColor }]} numberOfLines={1}>
          {mark.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/**
 * The live mark-preview strip: getMarksForGoal(title), capped to 3–4 faint
 * tiles. Renders nothing for a sparse title (goalPreviewMarks gate) so the
 * screen fills with the user's OWN forming plan, not a generic guess.
 */
function MarkPreviewStrip({ title }: { title: string }) {
  const c = themedColors(useEffectiveTheme());
  // QC4-B-ui: which mark's explanation is open. Transient view state, not
  // persistent data — useState is correct here (no slice), same call as
  // mark/new's icon-grid disclosure (QC4-F).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const marks = goalPreviewMarks(title);
  if (marks.length === 0) return null;
  const expanded = marks.find((m) => m.id === expandedId) ?? null;
  return (
    <View style={styles.previewBlock} testID="goal-mark-preview">
      {/* QC4-B-ui: a headline, not a whisper (was fontSize.sm inkMuted) —
          mirrors mark/new's sectionLabel so the two bins read as one grammar. */}
      <Text style={[styles.sectionLabel, { color: c.inkDark }]}>What this takes</Text>
      <View style={styles.previewStrip}>
        {marks.map((m) => (
          <MarkPreviewChip
            key={m.id}
            mark={m}
            labelColor={c.inkMid}
            expanded={m.id === expandedId}
            onPress={() => setExpandedId((cur) => (cur === m.id ? null : m.id))}
          />
        ))}
      </View>
      {/* The explanation lands under the strip rather than inside the chip, so
          disclosing never reflows the row you are still reading. One plain
          sentence, straight from the mark library (QC4-B-data). */}
      {expanded ? (
        <Text
          testID="goal-mark-preview-description"
          style={[styles.previewDescription, { color: c.inkMid }]}
        >
          {expanded.description}
        </Text>
      ) : null}
    </View>
  );
}

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const { user } = useAuth();
  const createGoal = useGoalsStore(s => s.createGoal);
  const addMark = useMarksStore(s => s.addMark);
  const marks = useMarksStore(s => s.marks);

  const [step, setStep] = useState<Step>('title');
  const [title, setTitle] = useState(typeof params.title === 'string' ? params.title : '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestedMarks, setSuggestedMarks] = useState<MarkDefinition[]>([]);
  // VD-6/QC2-D: focus only after the pageSheet transition settles so the
  // keyboard animation never overlaps the sheet presentation (calm entrance).
  const titleInputRef = useDeferredAutoFocus(step === 'title');
  // QC2-D diagnostic: dev-only probe — if the half-render ever reproduces
  // again, one Metro line tells us whether the CONTAINER itself is short
  // (react-native-screens native measurement) or full (something inside).
  // QC3-A: kept as a verification instrument only — the real half-render fix is
  // now the DIRECT route into this screen (no chooser-sheet → pageSheet hop).
  const onProbeLayout = useHalfRenderProbe('goal/new');

  // QC5-B2: the presets are ALWAYS shown. QC5-B gated them on "user has zero
  // goals", reading "as a welcome" as first-run-only. The founder corrected it:
  // "The preset goals are not only for their first goal. They are there to have
  // Livra users experiment with the app and actually have a chance to Enjoy it."
  // They are a way in, every time — not a first-run tutorial that gets taken
  // away the moment you have one goal. There is deliberately no gate here.

  const canProceed = !!title.trim() && !saving;

  // QC4-C: the preset row stays on screen, so it stays a control. Tap seeds the
  // title, tapping a different one swaps it, tapping the selected one clears
  // it — changing your mind never requires cancelling out of the screen
  // (founder). Mirrors mark/new's stage/un-stage on the popular chips.
  const handlePresetPress = (example: string) => {
    setTitle((cur) => (cur.trim() === example ? '' : example));
  };

  const handleSetPlan = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setSuggestedMarks(getMarksForGoal(trimmed));
    setStep('commitment');
  };

  const handleSuggestPlan = () => {
    // VD-6/QC2-D: never present the next pageSheet while the keyboard is up —
    // the incoming modal can be measured against the keyboard-shrunk area.
    Keyboard.dismiss();
    const trimmed = title.trim();
    router.replace({
      pathname: '/goal/suggest' as any,
      params: trimmed
        ? { goalText: trimmed, source: 'goal_create_fallback' }
        : { source: 'goal_create_fallback' },
    });
  };

  const handleConfirm = async (selection: CommitmentSelection) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();

      // Create goal first to get its ID
      const newGoal = await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
        linked_mark_ids: [...selection.alreadyOwnedMarkIds],
        target_mark_count: selection.unlockThreshold > 0 ? selection.unlockThreshold : null,
        tier: selection.tier,
        frequency: selection.frequency,
        method: 'manual',
      });

      // Create new marks with goal_id set
      const newMarkIds: string[] = [];
      for (const id of selection.selectedNewMarkIds) {
        const sugg = suggestedMarks.find(s => s.id === id);
        if (!sugg) continue;
        const newMark = await addMark({
          name: sugg.name,
          emoji: sugg.emoji,
          // QC4-M: category-derived, never the library's authored `color` —
          // that field is unsanctioned and disagrees with what the row renders.
          color: colorForSuggestedCounter(sugg),
          unit: sugg.unit,
          user_id: user.id,
          goal_period: 'day',
          schedule_type: 'daily',
          dailyTarget: 1,
          total: 0,
          enable_streak: false,
          sort_index: 0,
          goal_id: newGoal.id,
          frequency_kind: sugg.frequencyKind,
        });
        newMarkIds.push(newMark.id);
      }

      // Link new marks to goal
      if (newMarkIds.length > 0) {
        const { useGoalsStore: gs } = await import('../../state/goalsSlice');
        await Promise.all(newMarkIds.map(mId => gs.getState().linkMarkToGoal(newGoal.id, mId)));
      }

      router.back();
    } catch (err) {
      if (err instanceof GoalLimitError) {
        Alert.alert(
          'Two goals at a time',
          GOAL_LIMIT_MESSAGE,
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'See Livra+', onPress: () => router.push('/paywall') },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not save goal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (step === 'commitment') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.linen }} onLayout={onProbeLayout}>
        <CommitmentScreen
          goalTitle={title}
          goalWhy={description.trim() || undefined}
          suggestedMarks={suggestedMarks}
          userMarks={marks}
          onConfirm={handleConfirm}
          onBack={() => setStep('title')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]} onLayout={onProbeLayout}>
      {/* QC2-D: no KeyboardAvoidingView here, deliberately. It was the root of
          the device half-render: a keyboard-driven paddingBottom applied (via
          LayoutAnimation) against a native pageSheet is the only stateful layout
          in this flow that can stick at ~keyboard height — half the sheet. All
          content is top-anchored and everything, including the QC4-D action
          zone, lives inside the scroll, so nothing needs to avoid the keyboard;
          overflow on small devices scrolls instead. */}
      <View style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={styles.headerBtn}>
            <Text style={[styles.cancel, { color: c.inkMid }]}>Cancel</Text>
          </TouchableOpacity>
          {/* QC3-A: the header's "Next" is gone — the primary action now lives
              in the bottom-anchored forest CTA (founder: move the action off the
              tiny header). */}
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* QC4-E "The Bench and the Object": the REAL hollow goal card (FU-5
              treatment) is the screen's one focal point — and it is an OBJECT,
              not an input. QC2-H's caret-in-card (titleSlot) is superseded
              here: with the caret inside it, the card only ever CONTAINED your
              keystrokes, so nothing on the screen answered you (founder: "just
              text"). Now you operate the instrument below and watch this fill —
              small mechanical sans down there becomes Cormorant up here. It
              carries no touch targets at all. A title alone completes the card
              (FU-7a), and the QC3-A workbench law holds: it fills as you name
              it, live, per keystroke, no animation (that would be jitter). */}
          <GoalCardPreview
            testID="goal-card-preview"
            title={title}
            titlePlaceholder="Your goal"
            why={description}
            // The one thing that happens TO the goal rather than because of a
            // keystroke: the ember hairline arrives when the goal has a name.
            // Sanctioned ember (design-decisions Tokens: "goal-title flourish")
            // — a tint, never text, so the 2.37:1 light rule is not engaged.
            flourish={!!title.trim()}
          />

          {/* THE INSTRUMENT (QC4-E) — mark/new's exact grammar: surface card,
              hairline borderMid, quiet centered label, linen input inside. The
              translation between this and the card above IS the creation
              feeling. useDeferredAutoFocus's ref moved here from the card's
              old TextInput (VD-6/QC2-D: focus only after the pageSheet
              transition settles). */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderMid }]}>
            <Text style={[styles.groupLabel, { color: c.inkMid }]}>What you’re working toward</Text>
            <TextInput
              testID="goal-title-input"
              style={[styles.inputInCard, { backgroundColor: c.linen, color: c.inkDark, borderColor: c.borderMid }]}
              placeholder="e.g. Run a 5k"
              placeholderTextColor={c.inkMuted}
              ref={titleInputRef}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              returnKeyType="next"
              onSubmitEditing={handleSetPlan}
            />
            <TextInput
              testID="goal-why-input"
              style={[
                styles.inputInCard,
                styles.whyInputInCard,
                { backgroundColor: c.linen, color: c.inkDark, borderColor: c.borderMid },
              ]}
              placeholder="Why it matters · optional"
              placeholderTextColor={c.inkMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={200}
              multiline
            />
          </View>

          {/* QC4-D: the action zone rides directly under the instrument instead
              of in a screen-anchored bottom bar, where the keyboard buried it
              (founder). "Set the plan" first, the AI door directly below it.
              It sits BELOW the instrument, so it cannot push the input under
              the keyboard (the QC4-D × QC4-E shared constraint). Still not
              keyboard-avoiding — see the QC2-D note above; it scrolls. */}
          <View style={styles.actionZone}>
            <PillButton
              label="Set the plan →"
              onPress={handleSetPlan}
              disabled={!canProceed}
              fullWidth
            />
            <AIHatchButton
              label="✦ Or let Livra suggest a plan"
              onPress={handleSuggestPlan}
              style={styles.footerHatch}
            />
          </View>

          {/* The empty space becomes a preview of the future: the marks this
              goal will take, materializing as the title is typed. */}
          <MarkPreviewStrip title={title} />

          {/* THE PARTS BIN (QC4-C + QC4-E + QC5-B): colored, and — for a first
              -time user — the last thing on the screen. Tap to seed the title,
              tap another to swap, tap the selected one to clear; you can change
              your mind without cancelling the screen.

              QC5-B moved it BELOW the strip, to the bottom of the step. It was
              already below the action zone, so the CTA does not move by a single
              point: nothing above `styles.actionZone` changed in this task. That
              ordering is the QC4-D guarantee and it is pinned by test. */}
          <View style={styles.exampleBlock} testID="goal-example-chips">
            <Text style={[styles.sectionLabel, { color: c.inkDark }]}>Popular goals</Text>
            {/* One line, and it earns it: it points back UP at the instrument,
                so the bin reads as a way in rather than the only way in. */}
            <Text style={[styles.exampleHint, { color: c.inkMid }]}>
              Tap one to start, or write your own above.
            </Text>
            <View style={styles.exampleRow}>
              {EXAMPLE_GOAL_PARTS.map(({ title: example, accent, Icon }) => {
                const selected = title.trim() === example;
                return (
                  <TouchableOpacity
                    key={example}
                    style={[
                      styles.exampleChip,
                      {
                        backgroundColor: selected
                          ? applyOpacity(c.forest, 0.1)
                          : applyOpacity(accent, 0.14),
                        borderColor: selected ? c.forest : applyOpacity(accent, 0.45),
                      },
                    ]}
                    onPress={() => handlePresetPress(example)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={example}
                    accessibilityHint={selected ? 'Clears this goal' : 'Starts your goal with this'}
                    accessibilityState={{ selected }}
                  >
                    <Icon size={18} color={selected ? c.forest : accent} weight="duotone" />
                    <Text style={[styles.exampleChipText, { color: c.inkDark }]} numberOfLines={1}>
                      {example}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  // QC4-K: paddingTop = headerControl.topGap so the Cancel control clears the
  // safe-area inset instead of sitting flush against the notch.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
    minHeight: headerControl.minTarget,
  },
  headerBtn: { ...headerControlBoxLeading },
  cancel: { fontSize: fontSize.md },
  formScroll: { flex: 1 },
  // Screen gutter = spacing.lg applied ONCE, here on the scroll content
  // (the card carries no outer margin) — 2026-07-12 width rule.
  // QC4-D: spacing.md (not lg) between the card, the instrument, and the
  // action zone. The CTA's whole point is to clear the keyboard on a 667pt
  // device; 8pt of gutter each is the cheapest 24pt available and the rhythm
  // still reads (mark/new stacks its groups on spacing.sm).
  form: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  // QC4-E: the instrument group — mark/new's styles.card verbatim
  // (app/mark/new.tsx:809): surface fill, hairline borderMid, spacing.md pad.
  card: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  // Mirrors mark/new's styles.groupLabel — the mentor's quiet label, sentence
  // case, centered, no tracked uppercase kicker (design-system ban).
  groupLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  // Mirrors mark/new's styles.inputInCard. QC4-J: explicit height + horizontal
  // padding only — symmetric padding on a heightless single-line TextInput
  // lands the text and placeholder rects on different baselines.
  inputInCard: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  // The why is the same control, given room to wrap. Multiline needs its own
  // vertical padding (no fixed height to center against) — the QC4-J baseline
  // trap does not apply once textAlignVertical is explicit.
  whyInputInCard: {
    height: undefined,
    minHeight: 48,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
  },
  actionZone: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  exampleBlock: {
    marginTop: spacing.xl,
  },
  // QC5-B: sits between the sectionLabel and the row, so the label keeps its own
  // marginBottom and this only adds its own leading gap.
  exampleHint: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.45,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // QC4-E: mark/new's popular-chip treatment verbatim (app/mark/new.tsx:768) —
  // 1.5 accent border on a 0.14 accent fill, duotone glyph, 44pt floor. The
  // accent never touches the label ink (inkDark), so contrast is mark/new-safe.
  exampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    minHeight: headerControl.minTarget,
  },
  exampleChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  // Mirrors mark/new's styles.sectionLabel (app/mark/new.tsx:758) — the two
  // bins on the two creation screens now carry the same headline weight.
  sectionLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  previewBlock: {
    marginTop: spacing.xl,
  },
  previewStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // QC4-B-ui: the tiles "show themselves" — 44pt tap targets (the HIG minimum,
  // via headerControl.minTarget, the app's single source) carrying an 18pt
  // glyph and a base-size label, up from a 32pt decorative pill.
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: headerControl.minTarget,
  },
  previewChipLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
  },
  previewDescription: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.45,
    marginTop: spacing.md,
  },
  footerHatch: {
    alignSelf: 'stretch',
  },
});
