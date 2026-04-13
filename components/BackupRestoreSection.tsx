import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { exportBackup, importBackup } from '../lib/backup';
import { useMarksStore } from '../state/countersSlice';
import { useDailyTrackingStore } from '../state/dailyTrackingSlice';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/utils/logger';
import { applyOpacity } from '@/src/components/icons/color';

export interface BackupRestoreSectionProps {
  /** Single card with dividers (Profile / Data & Privacy layout) */
  embedded?: boolean;
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({ embedded = false }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const { user } = useAuth();
  const loadMarks = useMarksStore(s => s.loadMarks);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    const result = await exportBackup();
    setExporting(false);
    if (!result.success) Alert.alert('Export failed', result.message);
  };

  const handleImport = () => {
    Alert.alert('Restore backup', 'How would you like to restore?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Merge (keep existing data)', onPress: () => doImport('merge') },
      {
        text: 'Replace all data',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Replace all data?',
            'This will overwrite all current marks and history. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace', style: 'destructive', onPress: () => doImport('replace') },
            ],
          ),
      },
    ]);
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    setImporting(true);
    try {
      const result = await importBackup(mode);
      setImporting(false);
      if (result.success) {
        await loadMarks(user?.id);
        await useDailyTrackingStore.getState().loadDailyTracking();
        Alert.alert('Restore complete', result.message);
      } else {
        Alert.alert('Restore failed', result.message);
      }
    } catch (err) {
      setImporting(false);
      logger.error('[BackupRestoreSection] error:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  const rows = [
    {
      icon: 'cloud-upload-outline' as const,
      label: 'Export backup',
      sub: 'Create a portable data snapshot',
      onPress: handleExport,
      loading: exporting,
    },
    {
      icon: 'cloud-download-outline' as const,
      label: 'Restore backup',
      sub: 'Upload a previously saved state',
      onPress: handleImport,
      loading: importing,
    },
  ];

  const rowInner = (row: (typeof rows)[0], index: number, isLast: boolean) => (
    <TouchableOpacity
      key={row.label}
      style={[
        embedded ? styles.rowEmbedded : styles.row,
        embedded && !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.border },
        !embedded && { backgroundColor: themeColors.surface },
      ]}
      onPress={row.onPress}
      disabled={row.loading}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: applyOpacity(themeColors.accent.primary, theme === 'dark' ? 0.16 : 0.12) }]}>
        {row.loading ? (
          <ActivityIndicator size="small" color={themeColors.accent.primary} />
        ) : (
          <Ionicons name={row.icon} size={20} color={themeColors.textSecondary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: themeColors.text }]}>{row.label}</Text>
        <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>{row.sub}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={18} color={themeColors.textTertiary} />
    </TouchableOpacity>
  );

  if (embedded) {
    return (
      <View
        style={[
          styles.embeddedCard,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
          },
        ]}
      >
        {rows.map((row, i) => rowInner(row, i, i === rows.length - 1))}
      </View>
    );
  }

  return <>{rows.map((row, i) => rowInner(row, i, i === rows.length - 1))}</>;
};

const styles = StyleSheet.create({
  embeddedCard: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowEmbedded: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, marginBottom: 2 },
  rowSub: { fontSize: fontSize.sm },
});
