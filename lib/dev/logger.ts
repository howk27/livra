import { env } from '../env';

const sanitizeValue = (value: any): any => {
  if (typeof value === 'string') {
    return value
      .replace(/EXPO_PUBLIC_SUPABASE_[A-Z_]+=[^\s]+/gi, '[REDACTED]')
      .replace(/https?:\/\/[^\s]+supabase[^\s]+/gi, '[REDACTED_URL]')
      .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]');
  }
  if (value && typeof value === 'object') {
    try {
      const sanitized = JSON.parse(JSON.stringify(value));
      const sanitizeObject = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return sanitizeValue(obj);
        }
        if (Array.isArray(obj)) {
          return obj.map(sanitizeObject);
        }
        const result: any = {};
        for (const key in obj) {
          if (
            key.toLowerCase().includes('key') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('password')
          ) {
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
  return value;
};

const shouldLog = !env.isProduction;

export const logger = {
  log: (...args: any[]) => {
    if (shouldLog) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (shouldLog) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (shouldLog) {
      const sanitizedArgs = args.map(arg => sanitizeValue(arg));
      console.error(...sanitizedArgs);
    }
  },
  debug: (...args: any[]) => {
    if (shouldLog) {
      console.debug(...args);
    }
  },
  info: (...args: any[]) => {
    if (shouldLog) {
      console.info(...args);
    }
  },
};
