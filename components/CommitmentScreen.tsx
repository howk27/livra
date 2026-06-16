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
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.linen }}
      contentContainerStyle={[styles.container]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={[styles.backText, { color: c.inkMuted }]}>← Back</Text>
      </TouchableOpacity>

      <Text style={[styles.heading, { color: c.inkDark }]}>
        {isOnboarding ? 'What does this take?' : 'Your commitment'}
      </Text>
      {isOnboarding && (
        <Text style={[styles.subheading, { color: c.inkMuted }]}>
          These are the daily actions that build toward your goal. You can adjust anytime.
        </Text>
      )}

      {/* ── Marks ── */}
      <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>MARKS</Text>
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
                  backgroundColor: isSelected ? c.forest + '18' : c.surface,
                },
              ]}
            >
              <Text style={{ fontSize: 15 }}>{s.emoji}</Text>
              <Text style={[styles.markChipText, { color: isSelected ? c.inkDark : c.inkMuted }]}>
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
        <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>COMMITMENT LEVEL</Text>
        <TouchableOpacity
          onPress={() => setExplanationVisible('tier')}
          style={[styles.explainBtn, { borderColor: c.borderMid }]}
        >
          <Text style={[styles.explainBtnText, { color: c.inkMuted }]}>?</Text>
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
                backgroundColor: tier === t ? c.forest + '15' : c.surface,
              },
            ]}
          >
            <Text style={[styles.tierLabel, { color: tier === t ? c.inkDark : c.inkMuted }]}>
              {TIERS[t].label}
            </Text>
            {isOnboarding && (
              <Text style={[styles.tierDesc, { color: c.inkMuted }]}>
                {TIERS[t].description}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Frequency ── */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>FREQUENCY</Text>
        <TouchableOpacity
          onPress={() => setExplanationVisible('frequency')}
          style={[styles.explainBtn, { borderColor: c.borderMid }]}
        >
          <Text style={[styles.explainBtnText, { color: c.inkMuted }]}>?</Text>
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
                  backgroundColor: selected ? c.forest + '15' : c.surface,
                  opacity: allowed ? 1 : 0.35,
                },
              ]}
            >
              <Text style={[styles.freqLabel, { color: selected ? c.inkDark : c.inkMuted }]}>
                {FREQUENCIES[f].label}
              </Text>
              <Text style={[styles.freqMeta, { color: c.inkMuted }]}>{FREQUENCIES[f].range}</Text>
              <Text style={[styles.freqMeta, { color: c.inkMuted }]}>{FREQUENCIES[f].restDays}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {summary ? (
        <Text style={[styles.summary, { color: c.inkMuted }]}>{summary}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: c.forest, opacity: totalSelected === 0 ? 0.4 : 1 }]}
        onPress={handleConfirm}
        disabled={totalSelected === 0}
      >
        <Text style={styles.ctaText}>
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
                ? "Life gets in the way. That's not failure — that's just Tuesday. Keep going anyway."
                : "Rest days aren't days off. They're when the work actually sticks."}
            </Text>
            <TouchableOpacity onPress={() => setExplanationVisible(null)}>
              <Text style={[styles.modalClose, { color: c.inkMuted }]}>Got it</Text>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  backBtn: { marginBottom: spacing.sm },
  backText: { fontSize: fontSize.sm },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.xs },
  subheading: { fontSize: fontSize.sm, marginBottom: spacing.md, lineHeight: 20 },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  ownedBadge: { fontSize: 10, marginLeft: 2 },
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
  tierDesc: { fontSize: 10, textAlign: 'center', marginTop: 2 },
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
  freqMeta: { fontSize: 10 },
  summary: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.md },
  cta: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: { color: '#FFFFFF', fontWeight: fontWeight.bold, fontSize: fontSize.md },
  explainBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainBtnText: { fontSize: 11, lineHeight: 14 },
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
