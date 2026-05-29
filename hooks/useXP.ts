import { useXPStore } from '../state/xpSlice';
import { getLevelProgress, getBorderStyle, BorderStyle, LevelProgress } from '../lib/xpEngine';

export interface UseXPReturn {
  currentLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
  progressRatio: number;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  borderStyle: BorderStyle;
  pendingLevelUp: number | null;
  clearPendingLevelUp: () => void;
}

export function useXP(): UseXPReturn {
  const totalXP = useXPStore((s) => s.totalXP);
  const pendingLevelUp = useXPStore((s) => s.pendingLevelUp);
  const clearPendingLevelUp = useXPStore((s) => s.clearPendingLevelUp);

  const progress: LevelProgress = getLevelProgress(totalXP);
  const borderStyle: BorderStyle = getBorderStyle(progress.currentLevel);

  return {
    currentLevel: progress.currentLevel,
    levelTitle: progress.levelTitle,
    nextLevelTitle: progress.nextLevelTitle,
    progressRatio: progress.progressRatio,
    xpInCurrentLevel: progress.xpInCurrentLevel,
    xpToNextLevel: progress.xpToNextLevel,
    borderStyle,
    pendingLevelUp,
    clearPendingLevelUp,
  };
}
