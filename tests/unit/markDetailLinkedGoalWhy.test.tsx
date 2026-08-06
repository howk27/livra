/**
 * AI-MARK-WHY (2026-08-06) — mark detail's FEEDING INTO section renders the
 * pair's rationale as a quiet one-liner when present, and NOTHING when null.
 *
 * The why is a property of the (goal, mark) PAIR (`goal_mark_links.why`), so
 * the same mark under two goals shows each pair's own line — pinned here with
 * one goal carrying a why and the other carrying null in the same render.
 *
 * The heavy screen periphery (health, IAP, haptics, reanimated) is stubbed the
 * same way profileScreen.test.tsx stubs its screen; the section under test
 * renders real JSX from app/mark/[id]/index.tsx.
 */
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = () => React.createElement(View, null);
  return new Proxy({}, { get: (_: any, name: string) => (name === '__esModule' ? true : stub) });
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    Text: (props: any) => React.createElement(Text, props),
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    withSequence: (...vals: unknown[]) => vals[vals.length - 1],
    runOnJS: (fn: unknown) => fn,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: (props: any) => React.createElement(View, props, props.children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'mark-1' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium', Light: 'light' },
}));

jest.mock('../../lib/iap/iap', () => ({
  checkProStatus: jest.fn(async () => ({ effectiveUnlocked: false })),
}));
jest.mock('../../lib/health/healthPermissions', () => ({ requestPermissions: jest.fn() }));
jest.mock('../../lib/health/healthLearner', () => ({
  suggestStepGoal: jest.fn(async () => null),
  suggestWakeTime: jest.fn(async () => null),
}));
jest.mock('../../lib/notifications/sleepNotification', () => ({
  scheduleSleepNotification: jest.fn(),
  cancelSleepNotification: jest.fn(),
  getSleepNotifTime: jest.fn(async () => null),
  setSleepNotifTime: jest.fn(),
}));
jest.mock('../../lib/health/healthKitBinding', () => ({
  getHealthKitBinding: jest.fn(async () => null),
  setHealthKitBinding: jest.fn(),
}));
jest.mock('../../lib/health/healthAttribution', () => ({ hasHealthCheckinOn: () => false }));

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));
jest.mock('../../state/appDateSlice', () => ({
  useAppDateStore: (selector: (s: unknown) => unknown) => selector(undefined),
  selectAppDateKey: () => '2026-08-06',
}));

jest.mock('../../components/ui/LivraHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LivraHeader: () => React.createElement(View, null) };
});
jest.mock('../../components/ui/MarkFrequencyPicker', () => ({
  frequencyLabel: (n: number) => `${n} times a week`,
}));
jest.mock('../../components/ui/PillButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { PillButton: () => React.createElement(View, null) };
});
jest.mock('../../components/ui/SectionLabel', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { SectionLabel: (props: any) => React.createElement(Text, null, props.children) };
});
jest.mock('../../components/ui/overlays', () => ({ confirm: jest.fn(async () => false) }));
jest.mock('../../components/ui/MarkRow', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { CATEGORY_MAP: { custom: { Icon: () => React.createElement(View, null) } } };
});
jest.mock('../../components/mark/MarkDefinitionBlock', () => ({ MarkDefinitionBlock: () => null }));
jest.mock('../../components/LoadingScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LoadingScreen: () => React.createElement(View, null) };
});

jest.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ showError: jest.fn(), showSuccess: jest.fn() }),
}));
jest.mock('../../hooks/useCheckin', () => ({
  useCheckin: () => ({ logCheckin: jest.fn(async () => {}), undoCheckin: jest.fn(async () => {}) }),
}));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('../../hooks/useStreaks', () => ({ deriveStreakForMark: () => null }));

jest.mock('@/lib/markCategoryResolve', () => ({
  resolveLibraryMark: () => undefined,
  resolveMarkAccent: () => '#2D5446',
}));
jest.mock('../../lib/markDefinition', () => ({ resolveMarkDefinition: () => '' }));
jest.mock('../../lib/markDailyTarget', () => ({ resolveDailyTarget: () => 1 }));
jest.mock('../../lib/moments/emptyState', () => ({
  getEmptyStateCopy: () => ({ body: 'Log the first day.' }),
}));
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date(2026, 7, 6) }));
jest.mock('../../lib/features', () => ({
  currentWeekDates: () => [],
  markWeeklyState: () => 'due',
  computeCompletionsThisWeek: () => 0,
}));
jest.mock('@/src/components/icons/IconResolver', () => ({ resolveCounterIconType: () => null }));

jest.mock('@/lib/data/mutations/marks', () => ({
  useArchiveMarkMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/lib/data/checkins', () => ({ useUserCheckins: () => ({ data: [] }) }));

// Mutable query-layer state, set per test.
let mockMarksByGoal: Record<string, unknown[]> = {};
jest.mock('@/lib/data/marks', () => ({
  useMark: () => ({ data: mockMarkRow, isLoading: false }),
  useMarksForUser: () => ({ data: [mockMarkRow] }),
  useMarksByGoal: () => ({ data: mockMarksByGoal }),
}));

let mockGoalRows: unknown[] = [];
jest.mock('@/lib/data/goals', () => ({ useGoals: () => ({ data: mockGoalRows }) }));

import React from 'react';
import { render } from '@testing-library/react-native';
import MarkDetailScreen from '../../app/mark/[id]/index';

const mockMarkRow = {
  id: 'mark-1',
  user_id: 'user-1',
  name: 'Run',
  emoji: null,
  color: null,
  unit: 'sessions',
  enable_streak: false,
  sort_index: 0,
  last_activity_date: null,
  maintenance_of: null,
  frequency_kind: 'variable',
  frequency_min: 3,
  frequency_recommended: 5,
  frequency_max: 7,
  weekly_target: 5,
  dailyTarget: 1,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  deleted_at: null,
};

const goalRow = (id: string, title: string) => ({
  id,
  user_id: 'user-1',
  title,
  description: null,
  icon: null,
  color: null,
  sort_index: 0,
  status: 'active',
  target_mark_count: null,
  current_mark_count: 0,
  deadline_date: null,
  completed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  milestones_fired: null,
  banked_momentum_days: null,
  tier: null,
  frequency: null,
  deleted_at: null,
});

const WHY = 'Builds the endurance base this goal needs.';

beforeEach(() => {
  mockGoalRows = [goalRow('g1', 'Half marathon'), goalRow('g2', 'Stay active')];
  mockMarksByGoal = {};
});

describe('FEEDING INTO — the per-pair why line', () => {
  it('renders the AI sentence verbatim under the goal that carries it, and nothing under the null pair', () => {
    mockMarksByGoal = {
      g1: [{ ...mockMarkRow, link_why: WHY }],
      g2: [{ ...mockMarkRow, link_why: null }],
    };
    const api = render(<MarkDetailScreen />);

    // Both linked goals render…
    expect(api.getByText('Half marathon')).toBeTruthy();
    expect(api.getByText('Stay active')).toBeTruthy();
    // …but exactly ONE why line exists: g1's, verbatim. g2 (null) shows nothing.
    expect(api.queryAllByText(WHY)).toHaveLength(1);
  });

  it('renders no why line at all when every link carries null', () => {
    mockMarksByGoal = {
      g1: [{ ...mockMarkRow, link_why: null }],
      g2: [{ ...mockMarkRow, link_why: null }],
    };
    const api = render(<MarkDetailScreen />);

    expect(api.getByText('Half marathon')).toBeTruthy();
    expect(api.queryByText(WHY)).toBeNull();
  });
});
