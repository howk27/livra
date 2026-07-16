import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { themedColors, spacing, fontSize, fontWeight, borderRadius, fonts, headerControl, headerControlBoxLeading } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';
import { CATEGORY_MAP } from './ui/MarkRow';
import { GoalCardPreview } from './creation/GoalCardPreview';
import { goalPlanMeta } from '../lib/creation/creationPreview';
import { useEffectiveTheme } from '../state/uiSlice';
import {
  TierId,
  FrequencyId,
  TIERS,
  FREQUENCIES,
  calculateUnlockThreshold,
  commitmentSummary,
} from '../lib/goalMarkSuggestions';
import { MARK_LIBRARY_BY_ID, MarkDefinition } from '../lib/suggestedCounters';
import { canCreateGoalFromCommitment } from '../lib/goals/commitmentGate';
import { fillTemplate, pickTemplate } from '../lib/moments/content';
import { useVoiceStore } from '../state/voiceSlice';
import type { Mark } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommitmentSelection = {
  selectedNewMarkIds: string[];
  alreadyOwnedMarkIds: string[];
  tier: TierId;
  frequency: FrequencyId;
  unlockThreshold: number;
};

type Props = {
  goalTitle: string;
  /** The why, if entered on the previous step — rides on the live card. */
  goalWhy?: string;
  suggestedMarks: MarkDefinition[];
  userMarks: Mark[];
  onConfirm: (selection: CommitmentSelection) => void;
  onBack: () => void;
  isOnboarding?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findOwnedMark(suggested: MarkDefinition, userMarks: Mark[]): Mark | undefined {
  return userMarks.find(
    m => m.name.toLowerCase() === suggested.name.toLowerCase() || (m as any).icon === suggested.id
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommitmentScreen({
  goalTitle,
  goalWhy,
  suggestedMarks,
  userMarks,
  onConfirm,
  onBack,
  isOnboarding = false,
}: Props) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();

  const [selectedNewIds, setSelectedNewIds] = useState<Set<string>>(
    () => new Set(suggestedMarks.filter(s => !findOwnedMark(s, userMarks)).map(s => s.id))
  );
  const [tier, setTier] = useState<TierId>('building');
  const [frequency, setFrequency] = useState<FrequencyId>(TIERS['building'].defaultFrequency);
  const [explanationVisible, setExplanationVisible] = useState<'tier' | 'frequency' | null>(null);

  const handleTierSelect = (t: TierId) => {
    setTier(t);
    setFrequency(TIERS[t].defaultFrequency);
  };

  const handleFrequencySelect = (f: FrequencyId) => {
    if (TIERS[tier].allowedFrequencies.includes(f)) setFrequency(f);
  };

  const toggleMark = (id: string, owned: Mark | undefined) => {
    if (owned) {
      router.push(`/mark/${owned.id}` as any);
      return;
    }
    setSelectedNewIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    // QC2-H QA fix: the committed line is an earned moment — spoken once
    // through the voice pill on the surface the user lands on, not ambient
    // chrome on this screen.
    if (!isOnboarding) {
      const picked = pickTemplate('goalCommitted', 'confirmed');
      if (picked) {
        useVoiceStore.getState().speak({
          id: picked.id,
          surface: 'postLog',
          type: 'goalCommitted',
          text: fillTemplate(picked.template, { goalTitle }),
        });
      }
    }
    const alreadyOwnedMarkIds = suggestedMarks
      .map(s => findOwnedMark(s, userMarks))
      .filter(Boolean)
      .map(m => m!.id);

    const totalAssociated = alreadyOwnedMarkIds.length + selectedNewIds.size;
    const unlockThreshold = calculateUnlockThreshold(tier, frequency, totalAssociated);

    onConfirm({
      selectedNewMarkIds: Array.from(selectedNewIds),
      alreadyOwnedMarkIds,
      tier,
      frequency,
      unlockThreshold,
    });
  };

  const totalSelected = suggestedMarks.filter(s => {
    const owned = findOwnedMark(s, userMarks);
    return owned ? true : selectedNewIds.has(s.id);
  }).length;

  const summary = totalSelected > 0 ? commitmentSummary(tier, frequency, totalSelected) : '';
  const canProceed = canCreateGoalFromCommitment({ isOnboarding, selectedMarkCount: totalSelected });

  // QC2-H: every selected mark lands on the live card as an icon tile, and
  // the card's meta line rewrites with the tier/frequency decision — the plan
  // assembles on the artifact itself.
  const selectedForCard = suggestedMarks
    .filter(s => (findOwnedMark(s, userMarks) ? true : selectedNewIds.has(s.id)))
    .map(s => ({ id: s.id, name: s.name, icon: s.icon, category: s.category }));
  const planMeta = goalPlanMeta(totalSelected, totalSelected > 0 ? frequency : null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.linen }}
      contentContainerStyle={[styles.container]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
        <Text style={[styles.backText, { color: c.inkMid }]}>← Back</Text>
      </TouchableOpacity>

      {isOnboarding ? (
        <>
          <Text style={[styles.heading, { color: c.inkDark }]}>What does this take?</Text>
          <Text style={[styles.subheading, { color: c.inkMid }]}>
            These are the daily actions that build toward your goal. You can adjust anytime.
          </Text>
        </>
      ) : (
        /* QC2-H: the SAME hollow card from the title step persists here and
           gains its plan live — tiles for picked marks, a meta line for the
           cadence. The flourish draws now that the title is committed. */
        <View style={styles.echoWrap}>
          <GoalCardPreview
            testID="commitment-goal-card"
            title={goalTitle}
            why={goalWhy}
            flourish
            marks={selectedForCard}
            planMeta={planMeta}
          />
        </View>
      )}

      {/* ── Marks ── */}
      <Text style={[styles.sectionLabel, { color: c.inkMid }]}>Pick the work</Text>
      <View style={styles.chipRow}>
        {suggestedMarks.map(s => {
          const owned = findOwnedMark(s, userMarks);
          const isSelected = owned ? true : selectedNewIds.has(s.id);
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => toggleMark(s.id, owned)}
              style={[
                styles.markChip,
                {
                  borderColor: isSelected ? c.accent : c.borderLight,
                  backgroundColor: isSelected ? applyOpacity(c.forest, 0.09) : c.surface,
                },
              ]}
            >
              {/* QC5: the app's icon, not the emoji. The card tiles above
                  already render s.icon (see selectedForCard) — these chips were
                  the one place on the screen still speaking emoji, so the same
                  mark had two faces a few pixels apart. */}
              {(() => {
                const cat = CATEGORY_MAP[s.category] ?? CATEGORY_MAP.custom;
                const Icon = s.icon ?? cat.Icon;
                return <Icon size={16} color={cat.accent} weight="duotone" />;
              })()}
              <Text style={[styles.markChipText, { color: isSelected ? c.inkDark : c.inkMid }]}>
                {s.name}
              </Text>
              {owned && (
                <Text style={[styles.ownedBadge, { color: c.accent }]}>✓</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tier ── */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, styles.sectionLabelInRow, { color: c.inkMid }]}>How much</Text>
        <TouchableOpacity
          onPress={() => setExplanationVisible('tier')}
          style={[styles.explainBtn, { borderColor: c.borderMid }]}
        >
          <Text style={[styles.explainBtnText, { color: c.inkMid }]}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tierRow}>
        {(Object.keys(TIERS) as TierId[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => handleTierSelect(t)}
            style={[
              styles.tierBtn,
              {
                borderColor: tier === t ? c.accent : c.borderLight,
                backgroundColor: tier === t ? applyOpacity(c.forest, 0.08) : c.surface,
              },
            ]}
          >
            <Text style={[styles.tierLabel, { color: tier === t ? c.inkDark : c.inkMid }]}>
              {TIERS[t].label}
            </Text>
            {isOnboarding && (
              <Text style={[styles.tierDesc, { color: c.inkMid }]}>
                {TIERS[t].description}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Frequency ── */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, styles.sectionLabelInRow, { color: c.inkMid }]}>How often</Text>
        <TouchableOpacity
          onPress={() => setExplanationVisible('frequency')}
          style={[styles.explainBtn, { borderColor: c.borderMid }]}
        >
          <Text style={[styles.explainBtnText, { color: c.inkMid }]}>?</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.freqRow}>
        {(Object.keys(FREQUENCIES) as FrequencyId[]).map(f => {
          const allowed = TIERS[tier].allowedFrequencies.includes(f);
          const selected = frequency === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => handleFrequencySelect(f)}
              disabled={!allowed}
              style={[
                styles.freqBtn,
                {
                  borderColor: selected ? c.accent : c.borderLight,
                  backgroundColor: selected ? applyOpacity(c.forest, 0.08) : c.surface,
                  opacity: allowed ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.freqLabel, { color: selected ? c.inkDark : c.inkMid }]}>
                {FREQUENCIES[f].label}
              </Text>
              <Text style={[styles.freqMeta, { color: c.inkMid }]}>{FREQUENCIES[f].range}</Text>
              <Text style={[styles.freqMeta, { color: c.inkMid }]}>{FREQUENCIES[f].restDays}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {summary ? (
        <Text style={[styles.summary, { color: c.inkMid }]}>{summary}</Text>
      ) : !isOnboarding ? (
        <Text style={[styles.summary, { color: c.inkMid }]}>
          Add marks now or later · your goal is ready either way
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: c.forest, opacity: canProceed ? 1 : 0.4 }]}
        onPress={handleConfirm}
        disabled={!canProceed}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canProceed }}
      >
        <Text style={[styles.ctaText, { color: c.inkInverse }]}>
          {isOnboarding ? "Let's go" : 'Create goal'}
        </Text>
      </TouchableOpacity>

      {/* ── Explanation modal ── */}
      <Modal
        visible={explanationVisible !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExplanationVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setExplanationVisible(null)}
        >
          <View style={[styles.modalCard, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
            <Text style={[styles.modalText, { color: c.inkDark }]}>
              {explanationVisible === 'tier'
                ? "Life gets in the way. That's not failure. That's just Tuesday. Pick it back up when you can."
                : "Rest days aren't days off. They're when the work actually sticks."}
            </Text>
            <TouchableOpacity onPress={() => setExplanationVisible(null)}>
              <Text style={[styles.modalClose, { color: c.inkMid }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // Screen gutter = spacing.lg applied once, matching the title step so the
    // live card keeps its exact width across the two steps (same object).
    paddingHorizontal: spacing.lg,
    // QC5: was spacing.sm — half the sanctioned gap, which put the back control
    // in the strip the founder complained about. headerControl.topGap is the
    // app's single source; the parent SafeAreaView already supplies the inset.
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  // QC5: was `{ marginBottom: spacing.sm }` — no touch box, so the founder's
  // "back/edit buttons are way too high and hard to click" note survived QC4-K
  // on this surface. QC4-K swept app/ screens; this is a component, so both the
  // sweep and its guard missed it. Same contract as every other header control.
  backBtn: { ...headerControlBoxLeading, marginBottom: spacing.sm },
  backText: { fontSize: fontSize.sm },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  subheading: { fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  echoWrap: { marginBottom: spacing.xs },
  // QC2-H: the mentor's quiet labels — sentence case, centered, no tracked
  // uppercase (design-system kicker ban). One plain line per decision.
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabelInRow: { marginTop: 0, marginBottom: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  markChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
  },
  markChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  ownedBadge: { fontSize: fontSize['2xs'], marginLeft: 2 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tierBtn: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  tierLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, textAlign: 'center' },
  tierDesc: { fontSize: fontSize['2xs'], textAlign: 'center', marginTop: 2 },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  freqLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  freqMeta: { fontSize: fontSize['2xs'] },
  summary: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.md },
  cta: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: { fontWeight: fontWeight.bold, fontSize: fontSize.md },
  explainBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainBtnText: { fontSize: fontSize.xs, lineHeight: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 320,
    width: '100%',
  },
  modalText: { fontSize: fontSize.md, lineHeight: 24 },
  modalClose: { fontSize: fontSize.sm, textAlign: 'right', fontWeight: fontWeight.medium },
});
