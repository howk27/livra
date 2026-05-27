# Mark Reorder (Reanimated v4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `react-native-draggable-grid` in home screen edit mode with a custom Reanimated v4 + gesture handler drag-and-drop that is self-contained, tested, and avoids the existing auto-scroll polling.

**Architecture:** Two new components — `SortableMarkList` (owns shared values, layout container) and `SortableMarkRow` (per-row animated view + pan gesture on drag handle only). `home.tsx` drops the DraggableGrid import, all auto-scroll interval/ref logic (~80 lines), `gridData`, `renderGridItem`, and `handleGridDragRelease`, and replaces them with `<SortableMarkList>`. The existing `persistReorderedCounters` callback is passed through unchanged.

**Tech Stack:** `react-native-reanimated` 4.x (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `runOnJS`), `react-native-gesture-handler` (`Gesture.Pan`, `GestureDetector`), TypeScript strict.

---

## File Map

| Action | Path |
|--------|------|
| Create | `components/SortableMarkList.tsx` |
| Create | `components/SortableMarkRow.tsx` |
| Create | `tests/unit/sortableMarkOrder.test.ts` |
| Modify | `app/(tabs)/home.tsx` |

---

### Task 1: Write and pass unit test for order-swap logic

The swap logic (recalculate `positions` array when dragged item passes another) can be tested as a pure function, isolated from Reanimated.

**Files:**
- Create: `tests/unit/sortableMarkOrder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/sortableMarkOrder.test.ts
import { swapPositions, reorderByPositions } from '../../lib/utils/sortableMarkOrder';

describe('swapPositions', () => {
  it('swaps two positions in the array', () => {
    // positions[dataIndex] = display slot
    // marks at data indices 0,1,2 → display slots 0,1,2
    const positions = [0, 1, 2];
    const result = swapPositions(positions, 0, 1); // data index 0 moves to display slot 1
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(2);
  });

  it('does not mutate the original array', () => {
    const positions = [0, 1, 2];
    swapPositions(positions, 0, 2);
    expect(positions).toEqual([0, 1, 2]);
  });

  it('clamps target to valid range', () => {
    const positions = [0, 1, 2];
    // target beyond last slot — no-op swap
    const result = swapPositions(positions, 2, 5);
    expect(result).toEqual([0, 1, 2]);
  });
});

describe('reorderByPositions', () => {
  it('returns marks sorted by their assigned display slot', () => {
    const marks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any[];
    // data index 0→slot 2, 1→slot 0, 2→slot 1
    const positions = [2, 0, 1];
    const result = reorderByPositions(marks, positions);
    expect(result.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/sortableMarkOrder.test.ts --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '../../lib/utils/sortableMarkOrder'`

- [ ] **Step 3: Create the utility module**

```typescript
// lib/utils/sortableMarkOrder.ts

/**
 * Returns a new positions array with the display slots of dataIndexA and dataIndexB swapped.
 * positions[dataIndex] = current display slot (0 = top).
 * No-ops if targetSlot is out of range.
 */
export function swapPositions(positions: number[], dataIndexA: number, targetSlot: number): number[] {
  const total = positions.length;
  if (targetSlot < 0 || targetSlot >= total) return positions.slice();

  const result = positions.slice();
  const slotA = result[dataIndexA];
  const dataIndexB = result.indexOf(targetSlot);
  if (dataIndexB === -1) return result;

  result[dataIndexA] = targetSlot;
  result[dataIndexB] = slotA;
  return result;
}

/**
 * Returns marks sorted by their assigned display slot (ascending).
 */
export function reorderByPositions<T>(marks: T[], positions: number[]): T[] {
  return marks.slice().sort((a, b) => positions[marks.indexOf(a)] - positions[marks.indexOf(b)]);
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest tests/unit/sortableMarkOrder.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 4 passed`

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/utils/sortableMarkOrder.ts tests/unit/sortableMarkOrder.test.ts && git commit -m "test: add sortable mark order utility with unit tests"
```

---

### Task 2: Create SortableMarkRow component

This renders one animated row with the pan gesture attached only to the drag handle icon.

**Files:**
- Create: `components/SortableMarkRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
    scrollViewRef.current?.scrollTo({ y: Math.max(0, (scrollViewRef.current as any)?._nativeTag ?? 0), animated: false });
    // Use scrollBy if available
    (scrollViewRef.current as any)?.scrollTo?.({
      y: (scrollViewRef.current as any)?._scrollMetrics?.offset + dy,
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
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "SortableMarkRow" | head -20
```

Expected: No errors on this file (fix any that appear).

- [ ] **Step 3: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add components/SortableMarkRow.tsx && git commit -m "feat: add SortableMarkRow with Reanimated v4 pan gesture"
```

---

### Task 3: Create SortableMarkList component

Owns shared values, renders all rows at absolute positions in a fixed-height container.

**Files:**
- Create: `components/SortableMarkList.tsx`

- [ ] **Step 1: Create the file**

```tsx
// components/SortableMarkList.tsx
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Counter } from '../types';
import { SortableMarkRow, ITEM_HEIGHT } from './SortableMarkRow';

interface Props {
  marks: Counter[];
  onReorder: (orderedMarks: Counter[]) => void;
  onDelete: (mark: Counter) => void;
  showDelete: boolean;
  theme: 'light' | 'dark';
  scrollViewRef: React.RefObject<any>;
}

export function SortableMarkList({ marks, onReorder, onDelete, showDelete, theme, scrollViewRef }: Props) {
  const positions = useSharedValue<number[]>(marks.map((_, i) => i));
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const startY = useSharedValue(0);

  // Re-initialize positions when marks list changes (add/delete)
  useEffect(() => {
    positions.value = marks.map((_, i) => i);
  }, [marks.length]);

  const containerHeight = marks.length * ITEM_HEIGHT;

  return (
    <View style={{ height: containerHeight, position: 'relative' }}>
      {marks.map((mark, dataIndex) => (
        <SortableMarkRow
          key={mark.id}
          mark={mark}
          dataIndex={dataIndex}
          marks={marks}
          positions={positions}
          activeIndex={activeIndex}
          dragY={dragY}
          startY={startY}
          theme={theme}
          onReorder={onReorder}
          onDelete={onDelete}
          showDelete={showDelete}
          scrollViewRef={scrollViewRef}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | grep "SortableMarkList\|SortableMarkRow" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add components/SortableMarkList.tsx && git commit -m "feat: add SortableMarkList container with shared Reanimated values"
```

---

### Task 4: Wire SortableMarkList into home.tsx and remove DraggableGrid

**Files:**
- Modify: `app/(tabs)/home.tsx`

- [ ] **Step 1: Add the import and remove DraggableGrid import**

Find line 17 in `app/(tabs)/home.tsx`:
```typescript
import { DraggableGrid, IDraggableGridProps } from 'react-native-draggable-grid';
```
Replace it with:
```typescript
import { SortableMarkList } from '../../components/SortableMarkList';
```

- [ ] **Step 2: Remove auto-scroll refs and interval logic**

Remove the following block (lines ~842–989) in its entirety. This includes:
- `scrollOffsetRef`, `autoScrollIntervalRef`, `isDraggingRef`, `dragStartTimeRef`, `touchStartTimeRef`, `touchYPositionRef`, `lastTouchYRef`, `scrollStartDelayRef` declarations
- `handleScroll` callback
- `startAutoScroll` callback (~60 lines)
- `stopAutoScroll` callback
- The `useEffect` that calls `stopAutoScroll` on edit mode exit (lines ~981–989)
- `handleGridDragRelease` callback (lines ~962–979)

Also remove the `type GridCounter = Counter & { key: string }` line and `gridData` useMemo and `renderGridItem` useCallback (lines ~708–839).

After removal, keep: `persistReorderedCounters`, `handleDeleteCounter`, `scrollViewRef`, `scrollViewYRef`.

- [ ] **Step 3: Replace the edit mode ScrollView + DraggableGrid block with SortableMarkList**

Find this block in the render (around line 1165–1259):
```tsx
) : isEditMode ? (
  <ScrollView 
    ref={scrollViewRef}
    style={styles.scrollView}
    contentContainerStyle={styles.gridContainer}
    showsVerticalScrollIndicator={false}
    nestedScrollEnabled={true}
    scrollEnabled={scrollEnabled}
    scrollEventThrottle={16}
    onScroll={handleScroll}
    onLayout={...}
    onTouchStart={...}
    onTouchEnd={...}
    onTouchCancel={...}
  >
    <DraggableGrid
      key={...}
      data={gridData}
      numColumns={1}
      renderItem={renderGridItem}
      onDragRelease={handleGridDragRelease}
      delayLongPress={180}
      itemHeight={EDIT_ROW_HEIGHT + EDIT_ROW_GAP}
      style={styles.draggableGrid}
      dragStartAnimation={styles.dragStartAnimation}
    />
  </ScrollView>
```

Replace with:
```tsx
) : isEditMode ? (
  <ScrollView
    ref={scrollViewRef}
    style={styles.scrollView}
    contentContainerStyle={[styles.gridContainer, { paddingBottom: 24 }]}
    showsVerticalScrollIndicator={false}
  >
    <SortableMarkList
      marks={localCounters.filter((c) => !c.deleted_at)}
      onReorder={persistReorderedCounters}
      onDelete={handleDeleteCounter}
      showDelete={!!user}
      theme={theme}
      scrollViewRef={scrollViewRef}
    />
  </ScrollView>
```

- [ ] **Step 4: Remove unused state and styles**

Remove:
- `const [scrollEnabled, setScrollEnabled] = useState(true);` (it was only used by the DraggableGrid ScrollView)
- StyleSheet entries: `draggableGrid`, `dragStartAnimation`, `editItemWrapper`, `editItemInner`, `dragHandle` (the old one), `editIdentity`, `editIconWrap`, `editRowName` — only if not referenced elsewhere. Check with grep first:

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && grep -n "draggableGrid\|dragStartAnimation\|editItemWrapper\|editItemInner\|editIdentity\|editIconWrap\|editRowName\|scrollEnabled" app/\(tabs\)/home.tsx
```

Remove any that appear only in the deleted code.

- [ ] **Step 5: Type-check and lint**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | head -30
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx eslint "app/(tabs)/home.tsx" --max-warnings=0 2>&1 | head -20
```

Expected: No new errors. Fix any that appear.

- [ ] **Step 6: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/\(tabs\)/home.tsx && git commit -m "feat(reorder): replace DraggableGrid with SortableMarkList (Reanimated v4)"
```

---

### Task 5: Final type-check and test run

- [ ] **Step 1: Full type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx tsc --noEmit 2>&1 | head -40
```

Expected: Zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npx jest --no-coverage 2>&1 | tail -15
```

Expected: All existing tests still pass; 4 new sortableMarkOrder tests pass.

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git status
# Only commit if there are changes
git add -p && git commit -m "chore(reorder): cleanup after SortableMarkList integration"
```
