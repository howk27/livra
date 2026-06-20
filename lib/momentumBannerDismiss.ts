// Per-day "dismiss the at-risk banner" flag. Holds the last local date the user dismissed.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'livra_momentum_banner_dismissed_v1';

export async function getMomentumBannerDismissedDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setMomentumBannerDismissedDate(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, date);
  } catch {
    /* best effort */
  }
}
