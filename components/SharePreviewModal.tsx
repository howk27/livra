import React from 'react';
import {
  Modal,
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { themedColors } from '../theme/tokens';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import {
  SHARE_CARD_THEME_IDS,
  SHARE_CARD_ACCENT_IDS,
  SHARE_CARD_THEME_LABELS,
  SHARE_CARD_ACCENT_HEX,
  resolveCardColors,
  type ShareCardStyle,
  type ShareCardThemeId,
} from '../lib/sharing/shareCardThemes';
import { GoalCompletionShareCard } from './GoalCompletionShareCard';

const COLOR_WHITE = '#FFFFFF';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_WIDTH = SCREEN_WIDTH - spacing.xl * 2;
// 16:9 aspect ratio (landscape share card)
const PREVIEW_HEIGHT = (PREVIEW_WIDTH * 9) / 16;

export interface SharePreviewModalCardProps {
  goalTitle: string;
  completedDate: string;
  levelTitle: string;
  daysTaken: number;
  targetDateLabel?: string;
  bankedMomentumDays?: number | null;
}

export interface SharePreviewModalProps {
  visible: boolean;
  goalTitle: string;
  canCustomize: boolean;
  style: ShareCardStyle;
  onStyleChange: (patch: Partial<ShareCardStyle>) => void;
  onRequestUpgrade: () => void;
  onShare: () => void;
  onSave: () => void;
  onClose: () => void;
  saveLabel: string;
  cardProps: SharePreviewModalCardProps;
}

// ---------------------------------------------------------------------------
// Local ToggleRow
// ---------------------------------------------------------------------------

interface ToggleRowProps {
  label: string;
  value: boolean;
  onToggle: () => void;
  c: ReturnType<typeof themedColors>;
}

function ToggleRow({ label, value, onToggle, c }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow} accessibilityRole="none">
      <Text style={[styles.toggleLabel, { color: c.inkMid }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// SharePreviewModal
// ---------------------------------------------------------------------------

export const SharePreviewModal: React.FC<SharePreviewModalProps> = ({
  visible,
  goalTitle,
  canCustomize,
  style,
  onStyleChange,
  onRequestUpgrade,
  onShare,
  onSave,
  onClose,
  saveLabel,
  cardProps,
}) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
            },
          ]}
        >
          {/* Header row */}
          <View style={styles.header}>
            <Text style={[styles.goalTitle, { color: c.inkDark }]} numberOfLines={1}>
              {goalTitle}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Text style={[styles.closeIcon, { color: c.inkMid }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Live card preview */}
          <View
            style={[
              styles.previewContainer,
              { backgroundColor: c.surfaceAlt },
            ]}
          >
            <View style={styles.previewScale}>
              <GoalCompletionShareCard
                {...cardProps}
                style={style}
              />
            </View>
          </View>

          {/* Customize section */}
          {canCustomize ? (
            <View style={styles.customize}>
              <Text style={[styles.customizeHeader, { color: c.inkMid }]}>Customize</Text>

              {/* Theme swatches */}
              <View style={styles.swatchRow}>
                {SHARE_CARD_THEME_IDS.map((id: ShareCardThemeId) => {
                  const colors = resolveCardColors({ ...style, themeId: id });
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => onStyleChange({ themeId: id })}
                      accessibilityRole="button"
                      accessibilityLabel={SHARE_CARD_THEME_LABELS[id]}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: colors.bg,
                          borderColor: style.themeId === id ? c.forest : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[styles.swatchLabel, { color: colors.text }]}>
                        {SHARE_CARD_THEME_LABELS[id]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Accent swatches */}
              <View style={styles.swatchRow}>
                {SHARE_CARD_ACCENT_IDS.map((id) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => onStyleChange({ accentId: id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Accent ${id}`}
                    style={[
                      styles.accentSwatch,
                      {
                        backgroundColor: SHARE_CARD_ACCENT_HEX[id],
                        borderColor: style.accentId === id ? c.inkDark : 'transparent',
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Element toggles */}
              <ToggleRow
                label="Momentum line"
                value={style.showMomentum}
                onToggle={() => onStyleChange({ showMomentum: !style.showMomentum })}
                c={c}
              />
              <ToggleRow
                label="Level badge"
                value={style.showBadge}
                onToggle={() => onStyleChange({ showBadge: !style.showBadge })}
                c={c}
              />
              <ToggleRow
                label="Date"
                value={style.showDate}
                onToggle={() => onStyleChange({ showDate: !style.showDate })}
                c={c}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.lockedNudge}
              onPress={onRequestUpgrade}
              accessibilityRole="button"
              accessibilityLabel="Customize with Livra+"
            >
              <Text style={[styles.lockedNudgeText, { color: c.inkMid }]}>
                Customize · Livra+
              </Text>
            </TouchableOpacity>
          )}

          {/* Primary: Share button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: c.forest }]}
            onPress={onShare}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Share your goal"
          >
            <Text style={styles.primaryButtonText}>Share</Text>
          </TouchableOpacity>

          {/* Secondary: Save button */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              { borderColor: c.borderMid },
            ]}
            onPress={onSave}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
          >
            <Text style={[styles.secondaryButtonText, { color: c.inkMid }]}>
              {saveLabel}
            </Text>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  goalTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginRight: spacing.md,
  },
  closeIcon: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  previewContainer: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  previewScale: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Customize section
  customize: {
    marginBottom: spacing.lg,
  },
  customizeHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  swatch: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  accentSwatch: {
    flex: 1,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
  },
  // Locked nudge
  lockedNudge: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  lockedNudgeText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  // Buttons
  button: {
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: COLOR_WHITE,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
