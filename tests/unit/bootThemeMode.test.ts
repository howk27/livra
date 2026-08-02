/**
 * The launch screen must obey the theme setting (founder report 2026-08-02:
 * "the initial screen when opening the app is still hardcoded to green, doesn't
 * update with the theme change in settings").
 *
 * It was never hardcoded. `LoadingScreen` reads `useEffectiveTheme`, but it
 * renders in the exact window where the store still holds its `'system'`
 * default: `theme_mode` arrived only via `loadUIState`, which is gated behind
 * auth init and does a profile round-trip, while the native splash was hidden as
 * soon as the FONTS loaded. So every cold start showed a first screen that
 * followed the phone, not Settings — visible whenever the two disagree.
 *
 * `loadThemeMode` is the fix: one device-local key, no auth, no network, and
 * boot holds the splash on it. Because boot waits on it, the one thing it must
 * never do is fail to settle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../lib/supabase', () => ({ getSupabaseClient: () => ({}) }));
jest.mock('../../lib/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn(), log: jest.fn() },
}));

import { useUIStore, THEME_LOAD_TIMEOUT_MS } from '../../state/uiSlice';

describe('loadThemeMode (the boot-time theme read)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useUIStore.setState({ themeMode: 'system', themeLoaded: false });
  });

  it('applies the saved theme with no user and no network', async () => {
    await AsyncStorage.setItem('theme_mode', 'light');
    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeMode).toBe('light');
    expect(useUIStore.getState().themeLoaded).toBe(true);
  });

  it('applies a saved dark theme the same way', async () => {
    await AsyncStorage.setItem('theme_mode', 'dark');
    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeMode).toBe('dark');
  });

  it('keeps the system default when nothing is stored, and still settles', async () => {
    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeMode).toBe('system');
    expect(useUIStore.getState().themeLoaded).toBe(true);
  });

  it('ignores a value outside the ThemeMode union rather than trusting it', async () => {
    await AsyncStorage.setItem('theme_mode', 'forest');
    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeMode).toBe('system');
    expect(useUIStore.getState().themeLoaded).toBe(true);
  });

  it('settles even when storage rejects, so boot cannot hang on the splash', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeLoaded).toBe(true);
    expect(useUIStore.getState().themeMode).toBe('system');
    spy.mockRestore();
  });

  it('settles on a storage read that never resolves', async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise(() => {}));

    const pending = useUIStore.getState().loadThemeMode();
    jest.advanceTimersByTime(THEME_LOAD_TIMEOUT_MS);
    await pending;

    expect(useUIStore.getState().themeLoaded).toBe(true);
    spy.mockRestore();
    jest.useRealTimers();
  });

  it('does not re-read or stomp a theme that is already resolved', async () => {
    // A warm start can have loadUIState land first; and the user may change the
    // theme between the two. Neither may be overwritten by a late boot read.
    await AsyncStorage.setItem('theme_mode', 'light');
    useUIStore.setState({ themeMode: 'dark', themeLoaded: true });

    await useUIStore.getState().loadThemeMode();

    expect(useUIStore.getState().themeMode).toBe('dark');
  });
});

/**
 * Source-scan guard: jest never renders RootLayout (the boot crash of 7295dbc is
 * the standing proof), so the gate itself can only be checked structurally.
 * Comment-stripped, and confirmed red against `[fontsLoaded]` before being kept.
 */
describe('boot holds the native splash until the theme is known', () => {
  const source = readFileSync(join(__dirname, '../../app/_layout.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('hides the splash only once fonts AND theme have resolved', () => {
    const from = source.indexOf('SplashScreen.hideAsync');
    expect(from).toBeGreaterThan(-1);
    // The dependency array closing the effect that owns the hide call.
    const tail = source.slice(from, from + 200);
    expect(tail).toMatch(/\}, \[fontsLoaded, themeLoaded\]\);/);
    expect(source).toMatch(/if\s*\(fontsLoaded\s*&&\s*themeLoaded\)/);
  });

  it('kicks the theme read off without waiting for auth', () => {
    // The regression is moving this inside the `if (!initialized) return` effect
    // that gates loadUIState — that is the wait the bug was made of.
    expect(source).toMatch(/loadThemeMode\(\);/);
    const call = source.indexOf('loadThemeMode();');
    const guarded = source.slice(0, call).lastIndexOf('if (!initialized) return;');
    const effectStart = source.slice(0, call).lastIndexOf('useEffect(');
    expect(guarded).toBeLessThan(effectStart);
  });
});
