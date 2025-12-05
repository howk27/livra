import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { SuggestedCountersList } from '../../components/SuggestedCountersList';
import { SuggestedCounter } from '../../lib/suggestedCounters';
import { useAuth } from '../../hooks/useAuth';
import { DuplicateCounterError, DuplicateMarkError } from '../../state/countersSlice';
import { DuplicateCounterModal } from '../../components/DuplicateCounterModal';
import { useNotification } from '../../contexts/NotificationContext';
import { logger } from '../../lib/utils/logger';

// Emoji options that map to existing icon types in the app
const EMOJI_OPTIONS = ['🏋️', '📖', '🧘', '💧', '📚', '🎯', '📧', '✅', '🗣️', '😴', '👣', '🔥'];
const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#EF4444', '#EC4899'];
const UNIT_OPTIONS = ['sessions', 'days', 'items'];

export default function NewCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { createCounter, counters } = useCounters();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [mode, setMode] = useState<'suggested' | 'custom'>('suggested');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [unit, setUnit] = useState<'sessions' | 'days' | 'items'>('sessions');  
  const [enableStreak, setEnableStreak] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCounterName, setDuplicateCounterName] = useState('');
  const [existingCounterId, setExistingCounterId] = useState<string | null>(null);

  const handleSuggestedCounterSelect = async (counter: SuggestedCounter) => {
    try {
      setLoading(true);
      await createCounter({
        name: counter.name,
        emoji: counter.emoji,
        color: counter.color,
        unit: counter.unit,
        enable_streak: true,
        user_id: user?.id!,
      });
      // Show success notification
      showSuccess('Counter created successfully');
      // Small delay to allow sync to complete
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);
      
      // Handle duplicate counter error gracefully
      // Check for both DuplicateCounterError and DuplicateMarkError (which is what's actually thrown)
      if (error instanceof DuplicateCounterError || error instanceof DuplicateMarkError) {
        // Use logger.warn for expected errors (not logger.error)
        // DuplicateMarkError uses markName, DuplicateCounterError uses counterName
        const errorName = (error as any).markName || (error as any).counterName || 'Unknown';
        logger.warn(`[Counter] Duplicate counter detected: "${errorName}"`);
        
        // Find the existing counter
        const existingCounter = counters.find(
          (c) => c.name.toLowerCase() === errorName.toLowerCase() && !c.deleted_at
        );
        
        setDuplicateCounterName(errorName);
        setExistingCounterId(existingCounter?.id || null);
        setShowDuplicateModal(true);
      } else if (error instanceof Error && error.message.includes('FREE_COUNTER_LIMIT_REACHED')) {
        // Handle counter limit error
        logger.warn('[Counter] Counter limit reached for free user');
        showError('Counter limit reached. Upgrade to Livra+ to create unlimited counters.');
        // Navigate to paywall after a short delay
        setTimeout(() => {
          router.replace('/paywall');
        }, 2000);
      } else {
        // For unexpected errors, log as error and show notification
        logger.error('Error creating counter:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create counter. Please try again.';
        showError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

    const handleSave = async () => {
    if (!name.trim()) {
      showError('Please enter a counter name');
      return;
    }

    try {
      setLoading(true);
      await createCounter({
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
        user_id: user?.id!,
      });
      // Show success notification
      showSuccess('Counter created successfully');
      // Small delay to allow sync to complete
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);
      
      // Handle duplicate counter error gracefully
      // Check for both DuplicateCounterError and DuplicateMarkError (which is what's actually thrown)
      if (error instanceof DuplicateCounterError || error instanceof DuplicateMarkError) {
        // Use logger.warn for expected errors (not logger.error)
        // DuplicateMarkError uses markName, DuplicateCounterError uses counterName
        const errorName = (error as any).markName || (error as any).counterName || 'Unknown';
        logger.warn(`[Counter] Duplicate counter detected: "${errorName}"`);
        
        setDuplicateCounterName(errorName);
        setExistingCounterId(null);
        setShowDuplicateModal(true);
      } else if (error instanceof Error && error.message.includes('FREE_COUNTER_LIMIT_REACHED')) {
        // Handle counter limit error
        logger.warn('[Counter] Counter limit reached for free user');
        showError('Counter limit reached. Upgrade to Livra+ to create unlimited counters.');
        // Navigate to paywall after a short delay
        setTimeout(() => {
          router.replace('/paywall');
        }, 2000);
      } else {
        // For unexpected errors, log as error and show notification
        logger.error('Error creating counter:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create counter. Please try again.';
        showError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

    if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>Creating counter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelButton, { color: themeColors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Add a mark</Text>
        {mode === 'custom' && (
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[styles.saveButton, { color: themeColors.primary }]}>Save</Text>
          </TouchableOpacity>
        )}
        {mode === 'suggested' && <View style={styles.headerSpacer} />}
      </View>

      {/* Mode Toggle */}
      <View style={[styles.modeToggle, { backgroundColor: themeColors.surfaceVariant || themeColors.surface }]}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'suggested' && { backgroundColor: themeColors.primary + '20' },
          ]}
          onPress={() => setMode('suggested')}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'suggested' ? themeColors.primary : themeColors.textSecondary },
            ]}
          >
            Suggested
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'custom' && { backgroundColor: themeColors.primary + '20' },
          ]}
          onPress={() => setMode('custom')}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'custom' ? themeColors.primary : themeColors.textSecondary },
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'suggested' ? (
        <SuggestedCountersList onCounterSelect={handleSuggestedCounterSelect} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>

        {/* Name Field */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Name</Text>
                      <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Gym Sessions"
            placeholderTextColor={themeColors.textTertiary}
          />
        </View>

        {/* Emoji Picker */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Emoji</Text>
          <View style={styles.emojiGrid}>
            {EMOJI_OPTIONS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[
                  styles.emojiButton,
                  {
                    backgroundColor: e === emoji ? color + '30' : themeColors.surface,
                    borderColor: e === emoji ? color : themeColors.border,
                  },
                ]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Color</Text>
          <View style={styles.colorGrid}>
            {COLOR_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorButton,
                  {
                    backgroundColor: c,
                    borderWidth: c === color ? 3 : 0,
                    borderColor: themeColors.background,
                  },
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {/* Unit Selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.text }]}>Unit</Text>
          <View style={styles.unitButtons}>
            {UNIT_OPTIONS.map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.unitButton,
                  {
                    backgroundColor: u === unit ? color : themeColors.surface,
                    borderColor: u === unit ? color : themeColors.border,
                  },
                ]}
                onPress={() => setUnit(u as 'sessions' | 'days' | 'items')}
              >
                <Text
                  style={[styles.unitButtonText, { color: u === unit ? '#FFFFFF' : themeColors.text }]}
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Enable Streak Toggle */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.toggleRow, { backgroundColor: themeColors.surface }]}
            onPress={() => setEnableStreak(!enableStreak)}
          >
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Enable Streak</Text>
              <Text style={[styles.toggleDescription, { color: themeColors.textSecondary }]}>
                Track consecutive days with activity
              </Text>
            </View>
            <View
              style={[
                styles.toggleSwitch,
                {
                  backgroundColor: enableStreak ? color : themeColors.border,
                  alignItems: enableStreak ? 'flex-end' : 'flex-start',
                },
              ]}
            >
              <View style={styles.toggleThumb} />
            </View>
          </TouchableOpacity>
        </View>
        </ScrollView>
      )}

      {/* Duplicate Counter Modal */}
      <DuplicateCounterModal
        visible={showDuplicateModal}
        counterName={duplicateCounterName}
        onClose={() => {
          setShowDuplicateModal(false);
          setDuplicateCounterName('');
          setExistingCounterId(null);
        }}
        onGoToCounter={() => {
          setShowDuplicateModal(false);
          if (existingCounterId) {
            router.push(`/counter/${existingCounterId}`);
          } else {
            router.back();
          }
          setDuplicateCounterName('');
          setExistingCounterId(null);
        }}
        showGoToButton={!!existingCounterId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.base,
  },
  content: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    // borderBottomColor will be set dynamically in the component
  },
  headerSpacer: {
    width: 60,
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  cancelButton: {
    fontSize: fontSize.base,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  saveButton: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  input: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emojiButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  emojiText: {
    fontSize: 24,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.full,
  },
  unitButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 2,
  },
  unitButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textTransform: 'capitalize',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontSize: fontSize.sm,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
});

