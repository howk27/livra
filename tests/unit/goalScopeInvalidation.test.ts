// QC-1061 item 4 — "when deleting a goal it doesn't recalculate the check-ins".
//
// Every goal write (delete, archive, complete, edit, reorder) refreshes through
// `invalidateGoalScope`. The bug was an OMISSION from that one list: goals and
// marks were invalidated, check-ins were not. Deleting a goal soft-deletes the
// marks it orphans, so the check-in figures on screen kept counting a mark that
// no longer existed until an unrelated refetch corrected them.
//
// The list itself is therefore the unit worth testing — a hook-level test would
// exercise React Query rather than the decision that was wrong.

import { invalidateGoalScope } from '@/lib/data/mutations/goals';
import { queryKeys } from '@/lib/data/queryKeys';
import type { QueryClient } from '@tanstack/react-query';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';

function recordingClient() {
  const invalidated: unknown[][] = [];
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      invalidated.push([...queryKey]);
      return Promise.resolve();
    },
  } as unknown as QueryClient;
  return { client, invalidated };
}

/** Deep-equality membership — query keys are arrays, so `toContain` cannot see them. */
function invalidatedKey(invalidated: unknown[][], key: readonly unknown[]): boolean {
  return invalidated.some((k) => JSON.stringify(k) === JSON.stringify([...key]));
}

describe('invalidateGoalScope', () => {
  it('refreshes CHECK-INS as well as goals and marks', () => {
    // Confirmed red by deleting the checkinsRoot line: this is the only
    // assertion of the four that fails, which is exactly the shipped bug.
    const { client, invalidated } = recordingClient();

    invalidateGoalScope(client, USER);

    expect(invalidatedKey(invalidated, queryKeys.checkinsRoot(USER))).toBe(true);
  });

  it('still refreshes the goal and mark views it always did', () => {
    const { client, invalidated } = recordingClient();

    invalidateGoalScope(client, USER);

    expect(invalidatedKey(invalidated, queryKeys.goals(USER))).toBe(true);
    expect(invalidatedKey(invalidated, queryKeys.marks(USER))).toBe(true);
    expect(invalidatedKey(invalidated, queryKeys.marksByGoal(USER))).toBe(true);
  });

  it('scopes every refresh to the acting user', () => {
    // A bare root key would refresh (and re-fetch) another account's cache after
    // an account switch, which this project has paid for before.
    const { client, invalidated } = recordingClient();

    invalidateGoalScope(client, USER);

    expect(invalidated.length).toBeGreaterThan(0);
    expect(invalidated.every((k) => k.includes(USER))).toBe(true);
  });
});
