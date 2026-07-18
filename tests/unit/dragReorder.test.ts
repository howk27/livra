import { resolveDragSlot, SLOT_HYSTERESIS } from '../../lib/dragReorder';

// c-1: the reorder used Math.round(translationY / slotHeight), which flip-flops
// between two slots at the ±0.5-slot boundary on sub-pixel jitter — the "bounces
// between the two goals" the founder saw. These tests pin the hysteresis fix.

const H = 100; // slot height in px
const base = { slotHeight: H, startSlot: 0, count: 3 } as const;

describe('resolveDragSlot — hysteresis', () => {
  it('does NOT swap at the exact half-boundary (0.5 slot)', () => {
    // From slot 0, half a slot of travel is not enough to move.
    expect(resolveDragSlot({ ...base, translationY: 0.5 * H, currentSlot: 0 })).toBe(0);
  });

  it('does NOT reverse at the half-boundary once swapped', () => {
    // Already at slot 1; 0.5 slot back is inside the dead band → stays.
    expect(resolveDragSlot({ ...base, translationY: 0.5 * H, currentSlot: 1 })).toBe(1);
  });

  it('never flip-flops while the finger jitters around the boundary', () => {
    // Feed the previous result back in as currentSlot, jittering across 0.5.
    let slot = 0;
    const jitter = [0.48, 0.52, 0.49, 0.51, 0.5, 0.53, 0.47, 0.5];
    const seen = new Set<number>();
    for (const frac of jitter) {
      slot = resolveDragSlot({ ...base, translationY: frac * H, currentSlot: slot });
      seen.add(slot);
    }
    // The slot must never have changed — one value seen the whole time.
    expect([...seen]).toEqual([0]);
  });

  it('swaps forward only after crossing 0.5 + hysteresis', () => {
    expect(resolveDragSlot({ ...base, translationY: 0.65 * H, currentSlot: 0 })).toBe(0); // below 0.7
    expect(resolveDragSlot({ ...base, translationY: 0.71 * H, currentSlot: 0 })).toBe(1); // past 0.7
    expect(0.5 + SLOT_HYSTERESIS).toBeCloseTo(0.7);
  });

  it('requires extra retreat to reverse (no immediate swap-back)', () => {
    // At slot 1, 0.35 slot forward-of-origin is still inside the band → stays 1.
    expect(resolveDragSlot({ ...base, translationY: 0.35 * H, currentSlot: 1 })).toBe(1);
    // Only once it retreats past 0.3 does it fall back to 0.
    expect(resolveDragSlot({ ...base, translationY: 0.25 * H, currentSlot: 1 })).toBe(0);
  });

  it('advances multiple slots on a long drag and clamps to the ends', () => {
    expect(resolveDragSlot({ ...base, translationY: 1.8 * H, currentSlot: 0 })).toBe(2);
    expect(resolveDragSlot({ ...base, translationY: 99 * H, currentSlot: 0 })).toBe(2); // clamp hi
    expect(
      resolveDragSlot({ ...base, startSlot: 2, translationY: -99 * H, currentSlot: 2 }),
    ).toBe(0); // clamp lo
  });

  it('is a no-op for a single item or an unmeasured slot', () => {
    expect(resolveDragSlot({ ...base, count: 1, translationY: 5 * H, currentSlot: 0 })).toBe(0);
    expect(resolveDragSlot({ ...base, slotHeight: 0, translationY: 5 * H, currentSlot: 1 })).toBe(1);
  });
});
