import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock xpDb so the slice doesn't hit AsyncStorage
jest.mock('../../lib/db/xpDb', () => ({
  loadUserXP: jest.fn(),
  upsertUserXP: jest.fn(),
}));

import { useXPStore } from '../../state/xpSlice';
import { loadUserXP } from '../../lib/db/xpDb';

const mockLoadUserXP = loadUserXP as jest.MockedFunction<typeof loadUserXP>;

beforeEach(() => {
  useXPStore.setState({
    totalXP: 0,
    currentLevel: 1,
    pendingLevelUp: null,
    loading: false,
  });
  jest.clearAllMocks();
});

describe('loadXP', () => {
  it('sets totalXP and currentLevel from DB', async () => {
    mockLoadUserXP.mockResolvedValue({
      user_id: 'u1',
      total_xp: 500,
      current_level: 3,
      cooldown_until: null,
      last_7d_bonus_date: null,
      last_30d_bonus_date: null,
    });
    await useXPStore.getState().loadXP('u1');
    expect(useXPStore.getState().totalXP).toBe(500);
    expect(useXPStore.getState().currentLevel).toBe(3);
  });

  it('leaves state at defaults when no DB record exists', async () => {
    mockLoadUserXP.mockResolvedValue(null);
    await useXPStore.getState().loadXP('u1');
    expect(useXPStore.getState().totalXP).toBe(0);
    expect(useXPStore.getState().currentLevel).toBe(1);
  });
});

describe('applyXPResult', () => {
  it('updates totalXP and currentLevel', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 10, newTotal: 210, levelUp: null });
    expect(useXPStore.getState().totalXP).toBe(210);
    expect(useXPStore.getState().currentLevel).toBe(2);
  });

  it('sets pendingLevelUp when levelUp is non-null', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 200, newTotal: 200, levelUp: 2 });
    expect(useXPStore.getState().pendingLevelUp).toBe(2);
  });

  it('does not set pendingLevelUp when levelUp is null', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 10, newTotal: 110, levelUp: null });
    expect(useXPStore.getState().pendingLevelUp).toBeNull();
  });
});

describe('clearPendingLevelUp', () => {
  it('sets pendingLevelUp to null', () => {
    useXPStore.setState({ pendingLevelUp: 3 });
    useXPStore.getState().clearPendingLevelUp();
    expect(useXPStore.getState().pendingLevelUp).toBeNull();
  });
});
