import React, { useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { themedColors } from '../theme/tokens';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from '../components/Typography';

const CARD_PADDING = spacing.xxl;
const HEATMAP_DAYS = 28;
const HEATMAP_COLS = 7;
const HEATMAP_ROWS = HEATMAP_DAYS / HEATMAP_COLS;
const CELL_GAP = 3;

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildHeatmapData(
  logsByDate: Record<string, number>
): { date: string; intensity: 0 | 1 | 2 | 3 }[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(toDateString(d));
  }
  const maxCount = Math.max(...dates.map((d) => logsByDate[d] ?? 0), 1);
  const result: { date: string; intensity: 0 | 1 | 2 | 3 }[] = [];
  for (const dateStr of dates) {
    const count = logsByDate[dateStr] ?? 0;
    let intensity: 0 | 1 | 2 | 3 = 0;
    if (count > 0) {
      const ratio = count / maxCount;
      if (ratio >= 1) {
        intensity = 3;
      } else if (ratio >= 0.5) {
        intensity = 2;
      } else {
        intensity = 1;
      }
    }
    result.push({ date: dateStr, intensity });
  }
  return result;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  } else if (clean.length === 8) {
    clean = clean.slice(0, 6);
  }
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function accentWithOpacity(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;
}

interface HeatmapCellProps {
  intensity: 0 | 1 | 2 | 3;
  accentColor: string;
  cellSize: number;
}

const INTENSITY_OPACITY: Record<0 | 1 | 2 | 3, number> = {
  0: 0.08,
  1: 0.3,
  2: 0.65,
  3: 1,
};

function HeatmapCell({ intensity, accentColor, cellSize }: HeatmapCellProps) {
  const opacity = INTENSITY_OPACITY[intensity];
  const bg = accentWithOpacity(accentColor, opacity);
  return (
    <View
      style={[
        styles.cell,
        { width: cellSize, height: cellSize, backgroundColor: bg },
      ]}
    />
  );
}

export interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  momentum: number;
  logsByDate: Record<string, number>;
  totalMarks: number;
  accentColor: string;
  profileName: string;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  visible,
  onClose,
  title,
  momentum,
  logsByDate,
  totalMarks,
  accentColor,
  profileName,
}) => {
  const effectiveTheme = useEffectiveTheme();
  const chromeColors = themedColors(effectiveTheme);
  // The exported share card is a fixed on-brand surface: forest card with
  // light (inverse) ink, regardless of the app's active theme.
  const cardColors = themedColors('dark');
  const { width: screenWidth } = useWindowDimensions();
  const cellSize =
    (screenWidth - CARD_PADDING * 2 - spacing.lg * 2 - CELL_GAP * (HEATMAP_COLS - 1)) /
    HEATMAP_COLS;

  const heatmapData = useMemo(() => buildHeatmapData(logsByDate), [logsByDate]);

  const rows = useMemo(() => {
    const result: { date: string; intensity: 0 | 1 | 2 | 3 }[][] = [];
    for (let r = 0; r < HEATMAP_ROWS; r++) {
      result.push(heatmapData.slice(r * HEATMAP_COLS, r * HEATMAP_COLS + HEATMAP_COLS));
    }
    return result;
  }, [heatmapData]);

  const handleShare = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // haptics unavailable — ignore
    }

    const streakLine = `${totalMarks} mark${totalMarks !== 1 ? 's' : ''} tracked`;
    const message = [
      `${profileName} on Livra`,
      `"${title}"`,
      `Momentum: ${momentum}`,
      streakLine,
      '',
      'Track your habits with Livra.',
    ].join('\n');

    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message, url: 'https://apps.apple.com/app/livra' }
          : { message }
      );
    } catch {
      // share dismissed or unavailable — ignore
    }
  }, [profileName, title, momentum, totalMarks]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          { backgroundColor: accentWithOpacity(chromeColors.linen, 0.92) },
        ]}
      >
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Text style={[styles.closeIcon, { color: chromeColors.inkMid }]}>✕</Text>
          </TouchableOpacity>

          <View
            style={[
              styles.card,
              {
                backgroundColor: cardColors.forest,
                borderColor: accentWithOpacity(accentColor, 0.18),
              },
            ]}
          >
            <AppText
              variant="headline"
              style={[styles.titleText, { color: cardColors.inkInverse }]}
              numberOfLines={2}
              adjustsFontSizeToFit
            >
              {title}
            </AppText>

            <View style={styles.momentumRow}>
              <Text
                style={[
                  styles.momentumNumber,
                  { color: accentColor },
                ]}
              >
                {momentum}
              </Text>
              <AppText
                variant="caption"
                style={[styles.momentumLabel, { color: cardColors.inkInverseMuted }]}
              >
                MOMENTUM
              </AppText>
            </View>

            <View style={styles.heatmap}>
              {rows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.heatmapRow}>
                  {row.map((cell) => (
                    <HeatmapCell
                      key={cell.date}
                      intensity={cell.intensity}
                      accentColor={accentColor}
                      cellSize={cellSize}
                    />
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.cardFooter}>
              <Text style={[styles.wordmark, { color: cardColors.inkInverseMuted }]}>
                LIVRA
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.shareButton,
              { backgroundColor: accentColor },
            ]}
            onPress={handleShare}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Share your momentum"
          >
            <AppText
              variant="button"
              style={[styles.shareButtonText, { color: cardColors.inkInverse }]}
            >
              Share your momentum.
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    padding: spacing.xs,
  },
  closeIcon: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: CARD_PADDING,
    marginBottom: spacing.xl,
  },
  titleText: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  momentumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  momentumNumber: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['4xl'] * 1.1,
  },
  momentumLabel: {
    letterSpacing: 1.2,
  },
  heatmap: {
    gap: CELL_GAP,
    marginBottom: spacing.xl,
  },
  heatmapRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  cell: {
    borderRadius: borderRadius.sm,
  },
  cardFooter: {
    alignItems: 'flex-end',
  },
  wordmark: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
  },
  shareButton: {
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {},
});
