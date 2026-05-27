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
