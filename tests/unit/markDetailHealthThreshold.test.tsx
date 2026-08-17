/**
 * HEALTH THRESHOLD ROW (2026-08-17) — the connected Apple Health card carries
 * the number that decides whether a day qualifies, and lets the user change it.
 *
 * Until 2.0.1 the step goal was asked ONCE at connect time and sleepHours was
 * written by nothing at all, so a 6h30 night silently failed a 7-hour bar the
 * user could neither see nor move (.reports/polish.md, pinned until 2.0 shipped).
 *
 * Behavioural, not a source scan: the orphaned-modal history in this screen
 * (tests/unit/healthModalEntryPoint.test.ts) is exactly why the row is pinned by
 * rendering it and pressing it rather than by grepping for its identifier.
 *
 * Harness cloned from markDetailLinkedGoalWhy.test.tsx.
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
// Mutable per test: the binding IS the subject here.
let mockBinding: { type: string; config: Record<string, number> | null } | null = null;
const mockSetBinding = jest.fn(async () => {});
jest.mock('../../lib/health/healthKitBinding', () => ({
  getHealthKitBinding: jest.fn(async () => mockBinding),
  setHealthKitBinding: (...args: unknown[]) => mockSetBinding(...(args as [])),
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
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import MarkDetailScreen from '../../app/mark/[id]/index';
import { SLEEP_HOURS_DEFAULT, STEP_GOAL_FALLBACK } from '../../lib/health/healthDefaults';

const mockMarkRow = {
  id: 'mark-1',
  user_id: 'user-1',
  name: 'Sleep',
  emoji: null,
  color: null,
  unit: 'nights',
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

beforeEach(() => {
  mockGoalRows = [];
  mockMarksByGoal = {};
  mockBinding = null;
  mockSetBinding.mockClear();
});

/** Mount and let the binding-load effect settle. */
async function mount() {
  const api = render(<MarkDetailScreen />);
  await act(async () => {});
  return api;
}

describe('the threshold row', () => {
  it('shows the sleep target in force, defaults included, when nothing was ever stored', async () => {
    // config null is the REAL shape a manual connect writes for sleep: mark
    // detail passes null for every non-steps type.
    mockBinding = { type: 'sleep', config: null };
    const api = await mount();

    expect(api.getByText('Sleep target')).toBeTruthy();
    expect(api.getByText(`A night counts at ${SLEEP_HOURS_DEFAULT} hours of sleep.`)).toBeTruthy();
  });

  it('shows a stored sleep target over the default', async () => {
    mockBinding = { type: 'sleep', config: { sleepHours: 6.5 } };
    const api = await mount();
    expect(api.getByText('A night counts at 6.5 hours of sleep.')).toBeTruthy();
  });

  it('shows the step goal in force, grouped', async () => {
    mockBinding = { type: 'steps', config: null };
    const api = await mount();

    expect(api.getByText('Step goal')).toBeTruthy();
    expect(api.getByText(`A day counts at ${STEP_GOAL_FALLBACK.toLocaleString('en-US')} steps.`)).toBeTruthy();
  });

  it('does not offer a threshold for a workout mark, which has no number to set', async () => {
    mockBinding = { type: 'workout', config: null };
    const api = await mount();

    expect(api.queryByText('Sleep target')).toBeNull();
    expect(api.queryByText('Step goal')).toBeNull();
    expect(api.queryByText('Change')).toBeNull();
  });

  it('offers nothing when the mark is not connected at all', async () => {
    mockBinding = null;
    const api = await mount();
    expect(api.queryByText('Change')).toBeNull();
  });
});

describe('editing the threshold', () => {
  it('persists an edited sleep target and reflects it in the row', async () => {
    mockBinding = { type: 'sleep', config: null };
    const api = await mount();

    fireEvent.press(api.getByLabelText('Change sleep target'));
    // The sheet opens seeded with the value in force, not empty.
    const input = await waitFor(() => api.getByDisplayValue(String(SLEEP_HOURS_DEFAULT)));

    fireEvent.changeText(input, '6.5');
    await act(async () => {
      fireEvent.press(api.getByText('Save'));
    });

    expect(mockSetBinding).toHaveBeenCalledWith('mark-1', {
      type: 'sleep',
      config: { sleepHours: 6.5 },
    });
    expect(api.getByText('A night counts at 6.5 hours of sleep.')).toBeTruthy();
  });

  it('keeps the step goal when the sleep target is edited on a binding carrying both', async () => {
    mockBinding = { type: 'sleep', config: { stepGoal: 9000, sleepHours: 8 } };
    const api = await mount();

    fireEvent.press(api.getByLabelText('Change sleep target'));
    fireEvent.changeText(await waitFor(() => api.getByDisplayValue('8')), '6');
    await act(async () => {
      fireEvent.press(api.getByText('Save'));
    });

    expect(mockSetBinding).toHaveBeenCalledWith('mark-1', {
      type: 'sleep',
      config: { stepGoal: 9000, sleepHours: 6 },
    });
  });

  it('refuses a bad value and writes nothing', async () => {
    mockBinding = { type: 'sleep', config: null };
    const api = await mount();

    fireEvent.press(api.getByLabelText('Change sleep target'));
    fireEvent.changeText(await waitFor(() => api.getByDisplayValue('7')), '99');
    await act(async () => {
      fireEvent.press(api.getByText('Save'));
    });

    expect(mockSetBinding).not.toHaveBeenCalled();
  });

  it('cancel writes nothing and leaves the row as it was', async () => {
    mockBinding = { type: 'sleep', config: { sleepHours: 8 } };
    const api = await mount();

    fireEvent.press(api.getByLabelText('Change sleep target'));
    fireEvent.changeText(await waitFor(() => api.getByDisplayValue('8')), '6');
    fireEvent.press(api.getByText('Cancel'));

    expect(mockSetBinding).not.toHaveBeenCalled();
    expect(api.getByText('A night counts at 8 hours of sleep.')).toBeTruthy();
  });
});
