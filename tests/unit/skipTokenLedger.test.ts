/**
 * M9 Phase 5A Task 6 — featuresSlice.useSkipToken derives the monthly
 * allowance from its OWN token ledger. The old source (mark-row counters
 * skip_tokens_remaining/_month) lived only in the deleted local database.
 * Claims: 2 per mark per month, counted from this month's ledger entries;
 * a spend in an earlier month frees the slot; double-protecting a date is
 * refused before any allowance math.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useFeaturesStore } from '../../state/featuresSlice';
import type { SkipToken } from '../../types';

// LOCAL month, matching currentMonthISO — toISOString() is UTC and disagrees
// with it for the hours around a month boundary (how the mixed-clock bug in
// useSkipToken was caught in the first place).
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const token = (markId: string, dayIso: string, createdAt: string): SkipToken =>
  ({
    id: `t-${markId}-${dayIso}`,
    mark_id: markId,
    user_id: 'u1',
    protected_date: dayIso,
    created_at: createdAt,
  }) as SkipToken;

beforeEach(() => {
  useFeaturesStore.setState({ skipTokens: [], loading: false });
});

describe('useSkipToken (ledger-derived allowance)', () => {
  it('grants up to 2 tokens per mark per month, then refuses the 3rd', async () => {
    const store = useFeaturesStore.getState();
    expect((await store.useSkipToken('m1', 'u1', '2026-07-10')).success).toBe(true);
    expect((await useFeaturesStore.getState().useSkipToken('m1', 'u1', '2026-07-11')).success).toBe(
      true,
    );
    const third = await useFeaturesStore.getState().useSkipToken('m1', 'u1', '2026-07-12');
    expect(third.success).toBe(false);
    expect(third.message).toContain('No skip tokens remaining');
  });

  it('a spend from an earlier month does not count against this month', async () => {
    useFeaturesStore.setState({
      skipTokens: [
        token('m1', '2026-01-05', '2026-01-05T10:00:00Z'),
        token('m1', '2026-01-06', '2026-01-06T10:00:00Z'),
      ],
    });
    const result = await useFeaturesStore.getState().useSkipToken('m1', 'u1', '2026-07-10');
    expect(result.success).toBe(true);
  });

  it('another mark’s spends never bind this mark', async () => {
    useFeaturesStore.setState({
      skipTokens: [
        token('other', '2026-07-01', `${thisMonth}-01T10:00:00Z`),
        token('other', '2026-07-02', `${thisMonth}-02T10:00:00Z`),
      ],
    });
    expect((await useFeaturesStore.getState().useSkipToken('m1', 'u1', '2026-07-10')).success).toBe(
      true,
    );
  });

  it('refuses a date that is already protected, before any allowance math', async () => {
    useFeaturesStore.setState({
      skipTokens: [token('m1', '2026-07-10', `${thisMonth}-01T10:00:00Z`)],
    });
    const result = await useFeaturesStore.getState().useSkipToken('m1', 'u1', '2026-07-10');
    expect(result.success).toBe(false);
    expect(result.message).toContain('already protected');
  });
});
