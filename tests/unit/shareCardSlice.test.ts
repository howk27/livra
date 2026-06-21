import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShareCardStore, SHARE_CARD_STYLE_KEY } from '../../state/shareCardSlice';
import { DEFAULT_SHARE_CARD_STYLE } from '../../lib/sharing/shareCardThemes';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
}));

describe('shareCardSlice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShareCardStore.setState({ style: DEFAULT_SHARE_CARD_STYLE, loaded: false });
  });

  it('defaults to DEFAULT_SHARE_CARD_STYLE', () => {
    expect(useShareCardStore.getState().style).toEqual(DEFAULT_SHARE_CARD_STYLE);
  });

  it('updateStyle merges a patch and persists it', async () => {
    await useShareCardStore.getState().updateStyle({ themeId: 'night', showBadge: false });
    const { style } = useShareCardStore.getState();
    expect(style.themeId).toBe('night');
    expect(style.showBadge).toBe(false);
    expect(style.accentId).toBe('rose'); // untouched
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      SHARE_CARD_STYLE_KEY,
      JSON.stringify(style)
    );
  });

  it('loadShareCardStyle rehydrates a persisted style', async () => {
    const stored = { ...DEFAULT_SHARE_CARD_STYLE, accentId: 'gold' as const };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));
    await useShareCardStore.getState().loadShareCardStyle();
    expect(useShareCardStore.getState().style.accentId).toBe('gold');
    expect(useShareCardStore.getState().loaded).toBe(true);
  });

  it('loadShareCardStyle falls back to default on missing/invalid storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not json');
    await useShareCardStore.getState().loadShareCardStyle();
    expect(useShareCardStore.getState().style).toEqual(DEFAULT_SHARE_CARD_STYLE);
    expect(useShareCardStore.getState().loaded).toBe(true);
  });
});
