import { env } from '../env';

/** Dev-only: mock/seed/clear tools. Diagnostics screen unlock does not grant API access in production. */
export const canUseDevTools = (): boolean => env.isDev;

export const assertDevToolsAccess = (feature: string): void => {
  if (!canUseDevTools()) {
    throw new Error(`[DevTools] "${feature}" is disabled outside development builds.`);
  }
};
