// components/SortableMarkRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Counter } from '../types';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize } from '../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { swapPositions, reorderByPositions } from '../lib/utils/sortableMarkOrder';

export const ITEM_HEIGHT = 62; // EDIT_ROW_HEIGHT(58) + EDIT_ROW_GAP(4)

interface Props {
  mark: Counter;
  dataIndex: number;
  marks: Counter[];
  positions: SharedValue<number[]>;
  activeIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  startY: SharedValue<number>;
  theme: 'light' | 'dark';
  onReorder: (orderedMarks: Counter[]) => void;
  onDelete: (mark: Counter) => void;
  showDelete: boolean;
  scrollViewRef: React.RefObject<any>;
}

export function SortableMarkRow({
  mark,
  dataIndex,
  marks,
  positions,
  activeIndex,
  dragY,
  startY,
  theme,
  onReorder,
  onDelete,
  showDelete,
  scrollViewRef,
}: Props) {
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const markColor = mark.color || themeColors.primary;
  const iconType = resolveCounterIconType(mark);
  const rowBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';
  const borderC = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  function scrollBy(dy: number) {
    const metrics = (scrollViewRef.current as any)?._scrollMetrics;
    const currentOffset = metrics?.offset ?? 0;
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, currentOffset + dy),
      animated: false,
    });
  }

  const dragGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = positions.value[dataIndex] * ITEM_HEIGHT;
      activeIndex.value = dataIndex;
      dragY.value = 0;
    })
    .onUpdate((e) => {
      'worklet';
      dragY.value = e.translationY;

      const currentSlot = positions.value[dataIndex];
      const rawTarget = (startY.value + e.translationY) / ITEM_HEIGHT;
      const targetSlot = Math.round(rawTarget);
      const clampedSlot = Math.max(0, Math.min(marks.length - 1, targetSlot));

      if (clampedSlot !== currentSlot) {
        positions.value = swapPositions(positions.value, dataIndex, clampedSlot);
      }

      // Edge auto-scroll via runOnJS — simple, no interval polling
      if (e.absoluteY < 100) {
        runOnJS(scrollBy)(-8);
      } else if (e.absoluteY > 680) {
        runOnJS(scrollBy)(8);
      }
    })
    .onEnd(() => {
      'worklet';
      const finalPositions = positions.value.slice();
      activeIndex.value = -1;
      dragY.value = 0;
      runOnJS(onReorder)(reorderByPositions(marks, finalPositions));
    });

  const animatedStyle = useAnimatedStyle(() => {
    const slot = positions.value[dataIndex];
    if (activeIndex.value === dataIndex) {
      return {
        transform: [{ translateY: startY.value + dragY.value - dataIndex * ITEM_HEIGHT }],
        zIndex: 100,
        shadowOpacity: 0.15,
        shadowRadius: 8,
      };
    }
    return {
      transform: [{ translateY: withSpring((slot - dataIndex) * ITEM_HEIGHT, { damping: 20, stiffness: 200 }) }],
      zIndex: 1,
      shadowOpacity: 0,
      shadowRadius: 0,
    };
  });

  return (
    <Animated.View style={[styles.rowWrapper, animatedStyle]}>
      <View style={[styles.rowInner, { backgroundColor: rowBg, borderColor: borderC }]}>
        <GestureDetector gesture={dragGesture}>
          <View style={styles.dragHandle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="reorder-two-outline" size={20} color={themeColors.textSecondary} />
          </View>
        </GestureDetector>

        <View style={styles.identity}>
          <View style={[styles.iconWrap, { backgroundColor: applyOpacity(markColor, 0.15) }]}>
            <CounterIcon
              type={iconType ?? 'focus'}
              size={19}
              variant="symbol"
              animate="none"
              ariaLabel={`${mark.name} icon`}
              color={markColor}
            />
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: themeColors.text }]}>
            {mark.name}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        {showDelete && (
          <TouchableOpacity
            onPress={() => onDelete(mark)}
            style={styles.deleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={16} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  dragHandle: {
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: '500',
    flexShrink: 1,
  },
  deleteBtn: {
    paddingLeft: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
