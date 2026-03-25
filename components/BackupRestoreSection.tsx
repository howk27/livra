import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { exportBackup, importBackup } from '../lib/backup';
import { useMarksStore } from '../state/countersSlice';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/utils/logger';

export const BackupRestoreSection: React.FC = () => {
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
      sub: 'Save all marks & history as a JSON file',
      onPress: handleExport,
      loading: exporting,
    },
    {
      icon: 'cloud-download-outline' as const,
      label: 'Restore backup',
      sub: 'Import a previously exported backup file',
      onPress: handleImport,
      loading: importing,
    },
  ];

  return (
    <>
      {rows.map(row => (
        <TouchableOpacity
          key={row.label}
          style={[styles.row, { backgroundColor: themeColors.surface }]}
          onPress={row.onPress}
          disabled={row.loading}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: themeColors.background }]}>
            {row.loading ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Ionicons name={row.icon} size={20} color={themeColors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: themeColors.text }]}>{row.label}</Text>
            <Text style={[styles.rowSub, { color: themeColors.textSecondary }]}>{row.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
        </TouchableOpacity>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowSub: { fontSize: 12 },
});
