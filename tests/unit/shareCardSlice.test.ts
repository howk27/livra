import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useShareCardStore,
  DEFAULT_STORY_PREFS,
  SHARE_CARD_STYLE_KEY,
  STORY_PALETTE_KEY,
  STORY_PREFS_KEY,
} from '../../state/shareCardSlice';
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

  describe('storyPalette (Weekly Story card)', () => {
    beforeEach(() => {
      useShareCardStore.setState({ storyPalette: 'amber' });
    });

    it('defaults to amber', () => {
      expect(useShareCardStore.getState().storyPalette).toBe('amber');
    });

    it('setStoryPalette updates and persists under its own key', async () => {
      await useShareCardStore.getState().setStoryPalette('green');
      expect(useShareCardStore.getState().storyPalette).toBe('green');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORY_PALETTE_KEY, 'green');
    });

    it('loadStoryPalette rehydrates a valid id', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('green');
      await useShareCardStore.getState().loadStoryPalette();
      expect(useShareCardStore.getState().storyPalette).toBe('green');
    });

    it('loadStoryPalette ignores junk and read failures', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('rose');
      await useShareCardStore.getState().loadStoryPalette();
      expect(useShareCardStore.getState().storyPalette).toBe('amber');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
      await useShareCardStore.getState().loadStoryPalette();
      expect(useShareCardStore.getState().storyPalette).toBe('amber');
    });
  });

  // Story card personalization (spec 2026-09-20). Defaults ON: the card ships
  // rich and the toggles only ever take things away, so someone who never
  // touches them still shares in one tap.
  describe('storyPrefs', () => {
    beforeEach(() => {
      useShareCardStore.setState({ storyPrefs: DEFAULT_STORY_PREFS });
    });

    it('defaults every switch on', () => {
      expect(DEFAULT_STORY_PREFS).toEqual({ showName: true, showWeeksIn: true, showGoalTitle: true });
      expect(useShareCardStore.getState().storyPrefs).toEqual(DEFAULT_STORY_PREFS);
    });

    it('setStoryPref flips one switch and persists the whole set', async () => {
      await useShareCardStore.getState().setStoryPref('showGoalTitle', false);
      const { storyPrefs } = useShareCardStore.getState();
      expect(storyPrefs).toEqual({ showName: true, showWeeksIn: true, showGoalTitle: false });
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(STORY_PREFS_KEY, JSON.stringify(storyPrefs));
    });

    it('loadStoryPrefs rehydrates a stored set', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ showName: false, showWeeksIn: false, showGoalTitle: true }),
      );
      await useShareCardStore.getState().loadStoryPrefs();
      expect(useShareCardStore.getState().storyPrefs).toEqual({
        showName: false,
        showWeeksIn: false,
        showGoalTitle: true,
      });
    });

    it('a partial, junk or unreadable blob falls back switch by switch', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ showName: false, showWeeksIn: 'yes' }),
      );
      await useShareCardStore.getState().loadStoryPrefs();
      expect(useShareCardStore.getState().storyPrefs).toEqual({
        showName: false,
        showWeeksIn: true,
        showGoalTitle: true,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{not json');
      await useShareCardStore.getState().loadStoryPrefs();
      expect(useShareCardStore.getState().storyPrefs).toEqual(DEFAULT_STORY_PREFS);

      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
      await useShareCardStore.getState().loadStoryPrefs();
      expect(useShareCardStore.getState().storyPrefs).toEqual(DEFAULT_STORY_PREFS);
    });
  });
});
