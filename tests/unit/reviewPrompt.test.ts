// tests/unit/reviewPrompt.test.ts
// The App Store rating ask (0.11). Livra shipped six months with no
// `requestReview` call at all, so these tests pin the two things that make the
// prompt safe to ship: it is throttled, and it fails closed.

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(),
}));
jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../lib/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn(), log: jest.fn() },
}));

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  shouldRequestReview,
  maybeRequestReview,
  scheduleReviewPrompt,
  REVIEW_PROMPT_LAST_ASKED_KEY,
  REVIEW_PROMPT_MIN_INTERVAL_MS,
  REVIEW_PROMPT_DELAY_MS,
} from '../../lib/reviews/reviewPrompt';

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const hasAction = StoreReview.hasAction as jest.Mock;
const requestReview = StoreReview.requestReview as jest.Mock;

const NOW = 1_760_000_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  (AppState as any).currentState = 'active';
  getItem.mockResolvedValue(null);
  hasAction.mockResolvedValue(true);
  requestReview.mockResolvedValue(undefined);
});

describe('shouldRequestReview', () => {
  it('allows the first ever ask', async () => {
    await expect(shouldRequestReview(NOW)).resolves.toBe(true);
  });

  it('declines when the platform has no review action', async () => {
    hasAction.mockResolvedValue(false);
    await expect(shouldRequestReview(NOW)).resolves.toBe(false);
  });

  it('declines inside the 120-day window', async () => {
    getItem.mockResolvedValue(String(NOW - REVIEW_PROMPT_MIN_INTERVAL_MS + 1));
    await expect(shouldRequestReview(NOW)).resolves.toBe(false);
  });

  it('allows again exactly on the boundary', async () => {
    getItem.mockResolvedValue(String(NOW - REVIEW_PROMPT_MIN_INTERVAL_MS));
    await expect(shouldRequestReview(NOW)).resolves.toBe(true);
  });

  it('treats a corrupt timestamp as never-asked rather than locking out forever', async () => {
    getItem.mockResolvedValue('not-a-number');
    await expect(shouldRequestReview(NOW)).resolves.toBe(true);
  });

  it('declines when the app is not foregrounded', async () => {
    (AppState as any).currentState = 'background';
    await expect(shouldRequestReview(NOW)).resolves.toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it('fails closed when storage throws', async () => {
    getItem.mockRejectedValue(new Error('storage unavailable'));
    await expect(shouldRequestReview(NOW)).resolves.toBe(false);
  });
});

describe('maybeRequestReview', () => {
  it('asks and records the attempt', async () => {
    await expect(maybeRequestReview(NOW)).resolves.toBe(true);
    expect(requestReview).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(REVIEW_PROMPT_LAST_ASKED_KEY, String(NOW));
  });

  it('records BEFORE asking, so a silent no-op still burns the slot', async () => {
    const order: string[] = [];
    setItem.mockImplementation(() => { order.push('setItem'); return Promise.resolve(); });
    requestReview.mockImplementation(() => { order.push('requestReview'); return Promise.resolve(); });
    await maybeRequestReview(NOW);
    expect(order).toEqual(['setItem', 'requestReview']);
  });

  it('does not ask when throttled', async () => {
    getItem.mockResolvedValue(String(NOW));
    await expect(maybeRequestReview(NOW)).resolves.toBe(false);
    expect(requestReview).not.toHaveBeenCalled();
  });

  it('does not burn the 120-day slot when backgrounded', async () => {
    (AppState as any).currentState = 'background';
    await expect(maybeRequestReview(NOW)).resolves.toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('swallows a requestReview failure instead of surfacing it to the overlay', async () => {
    requestReview.mockRejectedValue(new Error('no window scene'));
    await expect(maybeRequestReview(NOW)).resolves.toBe(false);
  });
});

describe('scheduleReviewPrompt', () => {
  it('waits for the overlay exit before asking', async () => {
    jest.useFakeTimers();
    scheduleReviewPrompt();
    expect(requestReview).not.toHaveBeenCalled();
    jest.advanceTimersByTime(REVIEW_PROMPT_DELAY_MS);
    jest.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();
    expect(hasAction).toHaveBeenCalled();
  });
});
