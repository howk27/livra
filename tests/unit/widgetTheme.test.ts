/**
 * The widget follows the APP's theme, not the phone's (founder ruling
 * 2026-08-02). WidgetKit can only see the system appearance, so the app has to
 * put its own effective theme INTO the snapshot and the Swift side has to
 * render in it.
 *
 * The TS half is tested behaviourally here — the snapshot's `theme` for each
 * themeMode. The Swift half cannot be executed from jest (it compiles only at
 * EAS), so it is source-scanned in widgetBundleGuard.test.ts, over
 * COMMENT-STRIPPED source.
 */
import { Appearance } from 'react-native';

jest.mock('react-native-shared-group-preferences', () => ({
  __esModule: true,
  default: { setItem: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: { getSession: jest.fn(async () => ({ data: { session: null } })) },
  })),
}));

jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn().mockResolvedValue({ effectiveUnlocked: false }),
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import { buildWidgetData, currentAppTheme } from '../../lib/widgets/widgetSync';
import { useUIStore } from '../../state/uiSlice';
/* eslint-enable import/first */

const setMode = (mode: 'light' | 'dark' | 'system') => {
  useUIStore.setState({ themeMode: mode });
};

describe('the snapshot carries the app theme', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setMode('system');
  });

  it('reports the explicit app theme when the user has chosen one', () => {
    setMode('dark');
    expect(currentAppTheme()).toBe('dark');
    setMode('light');
    expect(currentAppTheme()).toBe('light');
  });

  it('resolves system mode from the OS appearance, both ways', () => {
    setMode('system');
    const spy = jest.spyOn(Appearance, 'getColorScheme');

    spy.mockReturnValue('dark');
    expect(currentAppTheme()).toBe('dark');

    spy.mockReturnValue('light');
    expect(currentAppTheme()).toBe('light');
  });

  it('treats an unknown OS appearance as light rather than crashing', () => {
    setMode('system');
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(null);
    expect(currentAppTheme()).toBe('light');
  });

  // The regression that matters: the app is forced to LIGHT while the phone is
  // DARK. Before this field the widget read the phone and went dark beside a
  // light app — the founder's "widgets don't change theme with the app".
  it('follows the app when the app and the phone disagree', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    setMode('light');
    expect(currentAppTheme()).toBe('light');
  });

  it('writes the theme into the snapshot even on the signed-out early return', async () => {
    setMode('dark');
    const data = await buildWidgetData();
    // Signed out: no goals, but the theme must still be there — this is the path
    // a fresh install renders through.
    expect(data.goals).toEqual([]);
    expect(data.theme).toBe('dark');
  });
});
