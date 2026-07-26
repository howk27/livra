import { useGoalsStore } from '../../state/goalsSlice';
import { loadGoalsForUser } from '../../lib/db/goalsDb';

jest.mock('../../lib/db/goalsDb', () => ({
  ...jest.requireActual('../../lib/db/goalsDb'),
  loadGoalsForUser: jest.fn(),
}));

/**
 * `useGoalsStore.error` is rendered STRAIGHT to the screen by two surfaces
 * (app/(tabs)/goals.tsx and app/mark/new.tsx), so whatever it holds is copy,
 * not a diagnostic. It used to hold `e.message` — a Supabase code or a fetch
 * failure — which tells the user nothing they can act on and leaks internals
 * into the UI. The real message belongs in the log.
 */
const mockLoad = loadGoalsForUser as jest.MockedFunction<typeof loadGoalsForUser>;

describe('fetchGoals failure copy', () => {
  beforeEach(() => {
    useGoalsStore.setState({ goals: [], isLoading: false, error: null });
    mockLoad.mockReset();
  });

  it('never puts a raw exception message on screen', async () => {
    mockLoad.mockRejectedValue(new Error('PGRST301: JWT expired at row 4'));

    await useGoalsStore.getState().fetchGoals('user-1');

    const { error, isLoading } = useGoalsStore.getState();
    expect(error).toBe('Could not load your goals. Try again.');
    expect(error).not.toMatch(/PGRST301|JWT/);
    expect(isLoading).toBe(false);
  });

  it('says the same actionable thing when the failure is not an Error at all', async () => {
    mockLoad.mockRejectedValue('a bare string rejection');

    await useGoalsStore.getState().fetchGoals('user-1');

    expect(useGoalsStore.getState().error).toBe('Could not load your goals. Try again.');
  });

  it('clears the message once a load succeeds', async () => {
    mockLoad.mockRejectedValueOnce(new Error('offline'));
    await useGoalsStore.getState().fetchGoals('user-1');
    expect(useGoalsStore.getState().error).not.toBeNull();

    mockLoad.mockResolvedValueOnce([]);
    await useGoalsStore.getState().fetchGoals('user-1');
    expect(useGoalsStore.getState().error).toBeNull();
  });
});
