import Constants from 'expo-constants';

type AppEnv = 'development' | 'preview' | 'production';

const normalizeEnv = (value?: string | null): AppEnv | null => {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  if (normalized === 'prod') return 'production';
  if (normalized === 'dev') return 'development';
  if (normalized === 'preview') return 'preview';
  if (normalized === 'production') return 'production';
  if (normalized === 'development') return 'development';
  return null;
};

const envFromExpoExtra = normalizeEnv(Constants.expoConfig?.extra?.env);
const envFromProcess = normalizeEnv(process.env.EXPO_PUBLIC_ENV || process.env.NODE_ENV);
const resolvedEnv = envFromProcess || envFromExpoExtra;

// @ts-ignore - __DEV__ is a global in React Native
const runtimeIsDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

const isPreview = resolvedEnv === 'preview';
const isProduction = resolvedEnv === 'production' || (!runtimeIsDev && !isPreview);
const isDev = runtimeIsDev && !isProduction;

export const env = {
  isDev,
  isPreview,
  isProduction,
  enableDiagnosticsByDefault: isDev,
  allowMockData: isDev,
  executionEnvironment: Constants.executionEnvironment || 'unknown',
  appOwnership: Constants.appOwnership || 'unknown',
};
