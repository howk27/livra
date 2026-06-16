import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus, Flag } from 'phosphor-react-native';
import { SectionLabel } from './SectionLabel';
import { fonts, radius, spacing, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface QueueCardProps {
  isHero?: boolean;
  title: string;
  description?: string;
  sequenceNumber?: number;
  estimatedDuration?: string;
  onAdd?: () => void;
  style?: object;
}

export function QueueCard({
  isHero,
  title,
  description,
  sequenceNumber,
  estimatedDuration,
  onAdd,
  style,
}: QueueCardProps) {
  const theme = useEffectiveTheme();
  const colors = themedColors(theme);
  if (isHero) {
    return (
      <View style={[styles.heroCard, { backgroundColor: colors.forest }, style]}>
        <View style={styles.heroTopRow}>
          <View style={styles.nextDot}>
            <View style={[styles.dot, { backgroundColor: colors.mint }]} />
            <SectionLabel color={colors.inkInverseMuted}>NEXT IN LINE</SectionLabel>
          </View>
          {sequenceNumber != null && (
            <SectionLabel color={colors.inkInverseMuted}>
              {`Sequence ${String(sequenceNumber).padStart(2, '0')}`}
            </SectionLabel>
          )}
        </View>

        <Text style={[styles.heroTitle, { color: colors.inkInverse }]} numberOfLines={2}>{title}</Text>
        {description ? (
          <Text style={[styles.heroDescription, { color: colors.inkInverseMuted }]} numberOfLines={2}>{description}</Text>
        ) : null}

        {onAdd && (
          <TouchableOpacity style={[styles.heroAddBtn, { backgroundColor: colors.surface }]} onPress={onAdd} activeOpacity={0.8}>
            <Plus size={20} color={colors.forest} weight="bold" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]}>
      <View style={[styles.iconBox, { backgroundColor: colors.surfaceAlt }]}>
        <Flag size={18} color={colors.inkMid} weight="duotone" />
      </View>
      <View style={styles.cardCenter}>
        <Text style={[styles.cardTitle, { color: colors.inkDark }]} numberOfLines={2}>{title}</Text>
        {estimatedDuration ? (
          <Text style={[styles.cardMeta, { color: colors.inkMuted }]}>Est. duration: {estimatedDuration}</Text>
        ) : null}
      </View>
      <View style={styles.cardRight}>
        {sequenceNumber != null && (
          <Text style={[styles.seqNum, { color: colors.inkMuted }]}>{sequenceNumber}</Text>
        )}
        {onAdd && (
          <TouchableOpacity style={[styles.addCircle, { backgroundColor: colors.surfaceAlt }]} onPress={onAdd} activeOpacity={0.8}>
            <Plus size={16} color={colors.inkMid} weight="bold" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: fontSize['4xl'],
    lineHeight: 40,
    marginTop: spacing.sm,
  },
  heroDescription: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  heroAddBtn: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.card,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCenter: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize.xl,
    lineHeight: 26,
  },
  cardMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  seqNum: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
