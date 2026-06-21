import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SHARE_CARD_STYLE,
  type ShareCardStyle,
} from '../lib/sharing/shareCardThemes';

export const SHARE_CARD_STYLE_KEY = 'livra_share_card_style_v1';

interface ShareCardState {
  style: ShareCardStyle;
  loaded: boolean;
  setStyle: (style: ShareCardStyle) => Promise<void>;
  updateStyle: (patch: Partial<ShareCardStyle>) => Promise<void>;
  loadShareCardStyle: () => Promise<void>;
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
}));
