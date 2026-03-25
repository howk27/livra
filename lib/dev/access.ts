import { env } from '../env';
import { isDiagnosticsUnlocked } from './diagnosticsUnlock';

export const canUseDevTools = (): boolean => env.isDev || isDiagnosticsUnlocked();

export const assertDevToolsAccess = (feature: string): void => {
  if (!canUseDevTools()) {
    throw new Error(`[DevTools] "${feature}" is disabled outside development or unlocked diagnostics.`);
  }
};
