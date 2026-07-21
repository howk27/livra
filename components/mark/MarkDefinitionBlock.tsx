// components/mark/MarkDefinitionBlock.tsx
// The reference block at the bottom of the mark-detail screen. Two subtle,
// tappable questions — "What counts here?" reveals the per-mark definition,
// "What's a mark?" reveals the canonical TERMS.mark. Presentational + pure;
// the caret rotation is a static transform (reduced-motion safe by construction).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { themedColors, spacing, fonts, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { TERMS } from '../../lib/copy';

// One tappable question that discloses its answer. Owns its open state so the
// two rows toggle independently.
function RevealRow({ question, answer }: { question: string; answer: string }) {
  const c = themedColors(useEffectiveTheme());
  const [open, setOpen] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.linkTouch}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.link, { color: c.accent }]}>{question}</Text>
        <CaretRight
          size={14}
          weight="bold"
          color={c.accent}
          style={open ? styles.caretOpen : styles.caret}
        />
      </TouchableOpacity>
      {/* inkMid, not inkMuted: inkMuted fails AA 4.5:1 on linen at this size
          (repeat offender, see markDefinitionA11y.test.ts + design-decisions Log). */}
      {open && <Text style={[styles.concept, { color: c.inkMid }]}>{answer}</Text>}
    </View>
  );
}

export function MarkDefinitionBlock({ definition }: { definition: string }) {
  return (
    <View style={styles.wrap}>
      <RevealRow question="What counts here?" answer={definition} />
      <RevealRow question="What's a mark?" answer={TERMS.mark} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // 44pt floor for the tap target (RN sizes a single text line well under it).
  linkTouch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  link: { fontFamily: fonts.sansMedium, fontSize: fontSize.sm },
  caret: { transform: [{ rotate: '0deg' }] },
  caretOpen: { transform: [{ rotate: '90deg' }] },
  concept: { fontFamily: fonts.sansItalic, fontSize: fontSize.sm, lineHeight: 20 },
});
