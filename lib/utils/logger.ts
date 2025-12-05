/**
 * Production-safe logging utility
 * Logs are disabled in production builds
 * Uses React Native's __DEV__ global for proper development detection
 */

// Use React Native's __DEV__ global (automatically set by Metro bundler)
// @ts-ignore - __DEV__ is a global in React Native
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors, even in production (for crash reporting)
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
};

