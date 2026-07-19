// components/mark/MarkDefinitionBlock.tsx
// "What this measures" on the mark-detail screen: the per-mark definition plus a
// subtle, tappable reveal of the canonical TERMS.mark. Presentational + pure;
// no animation (reduced-motion safe by construction).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { themedColors, spacing, fonts, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { SectionLabel } from '../ui/SectionLabel';
import { TERMS } from '../../lib/copy';

export function MarkDefinitionBlock({ definition }: { definition: string }) {
  const c = themedColors(useEffectiveTheme());
  const [showConcept, setShowConcept] = useState(false);

  return (
    <View style={styles.wrap}>
      <SectionLabel>WHAT THIS MEASURES</SectionLabel>
      <Text style={[styles.definition, { color: c.inkMid }]}>{definition}</Text>
      <TouchableOpacity
        onPress={() => setShowConcept((v) => !v)}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.link, { color: c.accent }]}>What's a mark?</Text>
      </TouchableOpacity>
      {showConcept && (
        <Text style={[styles.concept, { color: c.inkMuted }]}>{TERMS.mark}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  definition: { fontFamily: fonts.sans, fontSize: fontSize.base, lineHeight: 22 },
  link: { fontFamily: fonts.sansMedium, fontSize: fontSize.sm },
  concept: { fontFamily: fonts.sansItalic, fontSize: fontSize.sm, lineHeight: 20 },
});
