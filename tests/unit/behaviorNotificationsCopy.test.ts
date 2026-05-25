// Mock native modules that behaviorNotifications.ts imports at the module level.
// These mocks are infrastructure-only — they allow the module to load in Jest
// without a native runtime. The tests themselves only exercise buildCopy, which
// is a pure function and does not call any of these.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../lib/db', () => ({ query: jest.fn() }));
jest.mock('../../lib/appDate', () => ({ getAppDate: jest.fn(() => new Date()) }));
jest.mock('../../lib/markDailyTarget', () => ({ resolveDailyTarget: jest.fn() }));
jest.mock('../../lib/features', () => ({ isMarkActiveOnDate: jest.fn() }));
jest.mock('../../hooks/useStreaks', () => ({ computeStreak: jest.fn() }));
jest.mock('../../lib/notifications/livraScheduledOwnership', () => ({
  cancelAllLivraScheduledNotifications: jest.fn(),
}));

import { buildCopy } from '../../services/behaviorNotifications';
import type { DayProgressSnapshot } from '../../services/behaviorNotifications';

function snapshot(overrides: Partial<DayProgressSnapshot> = {}): DayProgressSnapshot {
  return {
    todayStr: '2026-05-24',
    activeMarkCount: 3,
    completedCount: 1,
    incompleteCount: 2,
    incompleteNames: ['Workout', 'Deep Work'],
    anyStreakAtRisk: false,
    maxCurrentStreak: 5,
    ...overrides,
  };
}

const BANNED_PHRASES = [
  'streak alive',
  'lose the streak',
  'momentum going',
  'Save today',
  "Don't lose the streak",
];

function assertNoBannedPhrases(text: string) {
  for (const phrase of BANNED_PHRASES) {
    expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
  }
}

describe('buildCopy — structural correctness', () => {
  const types = ['momentum', 'midday', 'end_of_day', 'win'] as const;

  test.each(types)('%s returns non-empty title and body', (type) => {
    const { title, body } = buildCopy(type, snapshot());
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
  });
});

describe('buildCopy — no streak-threat language', () => {
  const types = ['momentum', 'midday', 'end_of_day', 'win'] as const;
  const snapshots = [
    snapshot(),
    snapshot({ anyStreakAtRisk: true, maxCurrentStreak: 7 }),
    snapshot({ completedCount: 0, incompleteCount: 3 }),
    snapshot({ completedCount: 3, incompleteCount: 0 }),
  ];

  for (const s of snapshots) {
    test.each(types)(`%s with streak=${s.maxCurrentStreak} has no banned phrases`, (type) => {
      const { title, body } = buildCopy(type, s);
      assertNoBannedPhrases(title);
      assertNoBannedPhrases(body);
    });
  }
});

describe('buildCopy — win type', () => {
  test('all done — body mentions all marks complete', () => {
    const { body } = buildCopy('win', snapshot({ completedCount: 3, incompleteCount: 0 }));
    expect(body).toContain('3');
  });

  test('not all done — body mentions counts', () => {
    const { body } = buildCopy('win', snapshot({ completedCount: 2, incompleteCount: 1 }));
    expect(body).toContain('2');
  });
});

describe('buildCopy — momentum type', () => {
  test('single incomplete mark uses mark name as title', () => {
    const { title } = buildCopy('momentum', snapshot({
      completedCount: 2,
      incompleteCount: 1,
      incompleteNames: ['Workout'],
    }));
    expect(title).toBe('Workout');
  });

  test('all incomplete — body references total count', () => {
    const { body } = buildCopy('momentum', snapshot({
      completedCount: 0,
      incompleteCount: 3,
      incompleteNames: ['Workout', 'Deep Work', 'Sleep'],
    }));
    expect(body).toContain('3');
  });
});
