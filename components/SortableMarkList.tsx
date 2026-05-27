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
