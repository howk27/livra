import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SHARE_CARD_STYLE,
  type ShareCardStyle,
} from '../lib/sharing/shareCardThemes';
import {
  DEFAULT_STORY_PALETTE,
  isStoryPaletteId,
  type StoryPaletteId,
} from '../lib/sharing/storyPalettes';

export const SHARE_CARD_STYLE_KEY = 'livra_share_card_style_v1';
/** Weekly Story card palette (spec 2026-09-15 §4). Its own key: the old
 *  goal-completion style blob stays byte-identical for anyone who has one. */
export const STORY_PALETTE_KEY = 'livra_story_palette_v1';
/** What the person keeps on the story card (spec 2026-09-20). Device
 *  scoped like the palette: a phone's card settings, not an account's. */
export const STORY_PREFS_KEY = 'livra_story_prefs_v1';

export type StoryPrefKey = 'showName' | 'showWeeksIn' | 'showGoalTitle';
export type StoryPrefs = Record<StoryPrefKey, boolean>;

/** Everything on: the toggles only ever subtract. */
export const DEFAULT_STORY_PREFS: StoryPrefs = {
  showName: true,
  showWeeksIn: true,
  showGoalTitle: true,
};

interface ShareCardState {
  style: ShareCardStyle;
  loaded: boolean;
  setStyle: (style: ShareCardStyle) => Promise<void>;
  updateStyle: (patch: Partial<ShareCardStyle>) => Promise<void>;
  loadShareCardStyle: () => Promise<void>;
  storyPalette: StoryPaletteId;
  setStoryPalette: (id: StoryPaletteId) => Promise<void>;
  loadStoryPalette: () => Promise<void>;
  storyPrefs: StoryPrefs;
  setStoryPref: (key: StoryPrefKey, value: boolean) => Promise<void>;
  loadStoryPrefs: () => Promise<void>;
}

export const useShareCardStore = create<ShareCardState>((set, get) => ({
  style: DEFAULT_SHARE_CARD_STYLE,
  loaded: false,

  setStyle: async (style) => {
    set({ style });
    await AsyncStorage.setItem(SHARE_CARD_STYLE_KEY, JSON.stringify(style));
  },

  updateStyle: async (patch) => {
    const next = { ...get().style, ...patch };
    set({ style: next });
    await AsyncStorage.setItem(SHARE_CARD_STYLE_KEY, JSON.stringify(next));
  },

  loadShareCardStyle: async () => {
    try {
      const raw = await AsyncStorage.getItem(SHARE_CARD_STYLE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ShareCardStyle>;
        set({ style: { ...DEFAULT_SHARE_CARD_STYLE, ...parsed }, loaded: true });
        return;
      }
    } catch {
      // fall through to default
    }
    set({ style: DEFAULT_SHARE_CARD_STYLE, loaded: true });
  },

  storyPalette: DEFAULT_STORY_PALETTE,

  setStoryPalette: async (id) => {
    set({ storyPalette: id });
    try {
      await AsyncStorage.setItem(STORY_PALETTE_KEY, id);
    } catch {
      // The in-memory choice still applies for this session.
    }
  },

  loadStoryPalette: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORY_PALETTE_KEY);
      set({ storyPalette: isStoryPaletteId(raw) ? raw : DEFAULT_STORY_PALETTE });
    } catch {
      set({ storyPalette: DEFAULT_STORY_PALETTE });
    }
  },

  storyPrefs: DEFAULT_STORY_PREFS,

  setStoryPref: async (key, value) => {
    const next = { ...get().storyPrefs, [key]: value };
    set({ storyPrefs: next });
    try {
      await AsyncStorage.setItem(STORY_PREFS_KEY, JSON.stringify(next));
    } catch {
      // The in-memory choice still applies for this session.
    }
  },

  loadStoryPrefs: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORY_PREFS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // Switch by switch: a half-written or older blob keeps every key it
      // does not carry at its default rather than dropping the whole set.
      const stored = (parsed ?? {}) as Partial<Record<StoryPrefKey, unknown>>;
      const next = { ...DEFAULT_STORY_PREFS };
      for (const key of Object.keys(DEFAULT_STORY_PREFS) as StoryPrefKey[]) {
        if (typeof stored[key] === 'boolean') next[key] = stored[key] as boolean;
      }
      set({ storyPrefs: next });
    } catch {
      set({ storyPrefs: DEFAULT_STORY_PREFS });
    }
  },
}));
