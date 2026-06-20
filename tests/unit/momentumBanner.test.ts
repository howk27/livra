import { shouldShowMomentumBanner } from '../../lib/momentumPresenter';
import {
  getMomentumBannerDismissedDate,
  setMomentumBannerDismissedDate,
} from '../../lib/momentumBannerDismiss';
import AsyncStorage from '@react-native-async-storage/async-storage';

const slipping = { state: 'slipping', days: 4, cushionRemaining: 0.5, slippingMarkId: 'm1' } as const;
const onTrack = { state: 'on_track', days: 4, cushionRemaining: null, slippingMarkId: null } as const;

describe('shouldShowMomentumBanner', () => {
  it('shows when any snapshot is slipping and not dismissed today', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, null, '2026-06-19')).toBe(true);
  });
  it('hides when dismissed today', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, '2026-06-19', '2026-06-19')).toBe(false);
  });
  it('returns next day after dismissal', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, '2026-06-18', '2026-06-19')).toBe(true);
  });
  it('auto-resolves: hidden when nothing slipping even if not dismissed', () => {
    expect(shouldShowMomentumBanner({ g1: onTrack }, null, '2026-06-19')).toBe(false);
  });
  it('hidden with no snapshots', () => {
    expect(shouldShowMomentumBanner({}, null, '2026-06-19')).toBe(false);
  });
});

describe('momentum banner dismiss store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  it('round-trips the dismissed date', async () => {
    expect(await getMomentumBannerDismissedDate()).toBeNull();
    await setMomentumBannerDismissedDate('2026-06-19');
    expect(await getMomentumBannerDismissedDate()).toBe('2026-06-19');
  });
});
