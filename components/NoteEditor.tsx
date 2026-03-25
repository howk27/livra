import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { useFeaturesStore } from '../state/featuresSlice';
import { todayISO } from '../lib/features';

interface NoteEditorProps {
  markId: string;
  userId: string;
  date?: string; // defaults to today
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ markId, userId, date }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const targetDate = date ?? todayISO();
  const { getNoteForDate, upsertNote, deleteNote } = useFeaturesStore();
  const existingNote = getNoteForDate(markId, targetDate);

  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(existingNote?.text ?? '');
  const inputRef = useRef<TextInput>(null);
  const borderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isEditing) setText(existingNote?.text ?? '');
  }, [existingNote?.text, isEditing]);

  const startEditing = () => {
    setIsEditing(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start(
      () => inputRef.current?.focus(),
    );
  };

  const handleBlur = async () => {
    setIsEditing(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    const trimmed = text.trim();
    if (!trimmed && existingNote) {
      await deleteNote(existingNote.id);
    } else if (trimmed) {
      await upsertNote(markId, userId, targetDate, trimmed);
    }
  };

  const handleDelete = async () => {
    setText('');
    Keyboard.dismiss();
    setIsEditing(false);
    if (existingNote) await deleteNote(existingNote.id);
  };

  const hasNote = (existingNote?.text ?? '').length > 0;
  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [themeColors.border, themeColors.primary],
  });

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
          Today's note
        </Text>
        {hasNote && !isEditing && (
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={15} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={[styles.box, { backgroundColor: themeColors.surface, borderColor }]}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onBlur={handleBlur}
            placeholder="Add a note for today…"
            placeholderTextColor={themeColors.textSecondary}
            style={[styles.input, { color: themeColors.text }]}
            multiline
            maxLength={500}
            returnKeyType="done"
            blurOnSubmit
          />
        ) : (
          <TouchableOpacity onPress={startEditing} activeOpacity={0.7} style={styles.touchable}>
            {hasNote ? (
              <Text style={[styles.noteText, { color: themeColors.text }]} numberOfLines={3}>
                {existingNote!.text}
              </Text>
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="create-outline" size={16} color={themeColors.textSecondary} />
                <Text style={[styles.placeholderText, { color: themeColors.textSecondary }]}>
                  Add a note for today…
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  box: { borderWidth: 1, borderRadius: 12, minHeight: 54 },
  touchable: { padding: 14, minHeight: 54, justifyContent: 'center' },
  noteText: { fontSize: 15, lineHeight: 22 },
  placeholder: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeholderText: { fontSize: 15 },
  input: { padding: 14, fontSize: 15, lineHeight: 22, minHeight: 54 },
});
