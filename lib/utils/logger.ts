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
    // But sanitize any sensitive data before logging
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') {
        // Remove any potential credential patterns from error messages
        return arg
          .replace(/EXPO_PUBLIC_SUPABASE_[A-Z_]+=[^\s]+/gi, '[REDACTED]')
          .replace(/https?:\/\/[^\s]+supabase[^\s]+/gi, '[REDACTED_URL]')
          .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]');
      }
      if (arg && typeof arg === 'object') {
        // Recursively sanitize object properties
        try {
          const sanitized = JSON.parse(JSON.stringify(arg));
          const sanitizeObject = (obj: any): any => {
            if (typeof obj !== 'object' || obj === null) {
              if (typeof obj === 'string') {
                return obj
                  .replace(/EXPO_PUBLIC_SUPABASE_[A-Z_]+=[^\s]+/gi, '[REDACTED]')
                  .replace(/https?:\/\/[^\s]+supabase[^\s]+/gi, '[REDACTED_URL]')
                  .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]');
              }
              return obj;
            }
            if (Array.isArray(obj)) {
              return obj.map(sanitizeObject);
            }
            const result: any = {};
            for (const key in obj) {
              // Skip logging sensitive keys
              if (key.toLowerCase().includes('key') || 
                  key.toLowerCase().includes('secret') || 
                  key.toLowerCase().includes('token') ||
                  key.toLowerCase().includes('password')) {
                result[key] = '[REDACTED]';
              } else {
                result[key] = sanitizeObject(obj[key]);
              }
            }
            return result;
          };
          return sanitizeObject(sanitized);
        } catch {
          return '[Object]';
        }
      }
      return arg;
    });
    console.error(...sanitizedArgs);
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

