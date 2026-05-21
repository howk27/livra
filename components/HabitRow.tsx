/**
 * Re-exports from MarkCard (Livra 2.0 rename).
 * All existing imports of HabitRow continue to work unchanged.
 */
export {
  MarkCard as HabitRow,
  HabitRowCounter,
  getCompressedProgress,
  type MarkCardProps as HabitRowProps,
  type CompressedProgress,
} from './MarkCard';
