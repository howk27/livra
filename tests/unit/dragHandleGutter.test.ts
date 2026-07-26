import { dragHandle, headerControl, spacing } from '../../theme/tokens';

/**
 * Device report 2026-07-25: "Goals screen bar is too long and it renders
 * overlapping with the drag mark. The Ready to complete banner is cramping the
 * card."
 *
 * The reorder handle is absolutely positioned over the row's full height at the
 * right edge, so it floats OVER the card. The card padded itself with
 * spacing.lg (24) while the handle occupies from 16 to 60pt off the right edge
 * — 36pt of overlap on every full-width element: the progress track, the
 * weekly line, and the "Ready to complete" banner with its right-hand caret.
 * It only appeared with 2+ goals, because that is when the handle renders.
 *
 * These assertions pin the relationship rather than the numbers, so moving the
 * handle without moving the gutter fails here instead of on a device.
 */
describe('drag handle geometry', () => {
  it('the gutter clears the whole handle, inset included', () => {
    expect(dragHandle.gutter).toBeGreaterThanOrEqual(dragHandle.inset + dragHandle.width);
  });

  it('the handle still meets the iOS minimum touch target', () => {
    expect(dragHandle.width).toBeGreaterThanOrEqual(headerControl.minTarget);
  });

  it('the gutter is wider than the card padding it replaces — otherwise it is a no-op', () => {
    expect(dragHandle.gutter).toBeGreaterThan(spacing.lg);
  });

  it('comes off the spacing scale rather than a hand-picked number', () => {
    expect(dragHandle.inset).toBe(spacing.md);
  });
});
