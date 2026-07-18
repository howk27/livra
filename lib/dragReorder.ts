// lib/dragReorder.ts
// Pure slot-resolution math for the Goals-screen drag-to-reorder (M7-QC (c)).
// Extracted from app/(tabs)/goals.tsx so the hysteresis is unit-testable and the
// pan worklet has no boundary flip-flop.
//
// The old code used `Math.round(translationY / slotHeight)`. At the ±0.5-slot
// boundary `Math.round` flips between two slots on sub-pixel finger jitter, so
// the passive row oscillates ("bounces between the two goals"). We replace it
// with a hysteresis band: a swap needs the finger to travel past 0.5 + H of a
// slot, and reversing needs it to retreat past 0.5 + H the other way — so at the
// exact half-boundary nothing changes and there is no oscillation.

/** Extra travel (in slot units) required beyond the half-boundary before a swap
 *  commits. 0.2 → a swap fires at 0.7 of a slot and won't reverse until 0.3, a
 *  0.4-slot dead band centred on the half-boundary. */
export const SLOT_HYSTERESIS = 0.2;

export interface ResolveDragSlotParams {
  /** Live pan translation on Y, in px (positive = dragged down). */
  translationY: number;
  /** Height of one slot (card + gap), in px. Must be > 0. */
  slotHeight: number;
  /** Slot the row occupied when the drag began. */
  startSlot: number;
  /** Slot the row currently occupies (last committed target). */
  currentSlot: number;
  /** Number of rows in the list. */
  count: number;
  /** Dead-band half-width in slot units; defaults to SLOT_HYSTERESIS. */
  hysteresis?: number;
}

/**
 * The slot the dragged row should occupy for a given pan translation, with
 * hysteresis so it never flip-flops at a boundary.
 *
 * Pure and deterministic: same inputs → same output, no side effects. Marked
 * `'worklet'` so the Reanimated pan handler can call it on the UI thread; the
 * directive is an inert string under Jest, so it is callable from tests too.
 */
export function resolveDragSlot({
  translationY,
  slotHeight,
  startSlot,
  currentSlot,
  count,
  hysteresis = SLOT_HYSTERESIS,
}: ResolveDragSlotParams): number {
  'worklet';
  if (slotHeight <= 0 || count <= 1) return currentSlot;

  // Continuous position of the finger, in slot units.
  const pos = startSlot + translationY / slotHeight;
  const threshold = 0.5 + hysteresis;

  let target = currentSlot;
  // Advance down only once the finger clears the forward threshold of each slot.
  while (target < count - 1 && pos > target + threshold) target += 1;
  // Retreat up only once the finger clears the backward threshold.
  while (target > 0 && pos < target - threshold) target -= 1;

  return target;
}
