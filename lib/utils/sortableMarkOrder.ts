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
