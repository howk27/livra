import { renderHook } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/markRow.test.tsx
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  withTiming: (v: any, config: any) => ({ kind: 'timing', to: v, ...config }),
  withSpring: (v: any, config: any) => ({ kind: 'spring', to: v, ...config }),
}));

let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduced,
}));

import { useMotion } from '../../hooks/useMotion';

describe('useMotion', () => {
  it('exposes reduced=false when Reduce Motion is off', () => {
    mockReduced = false;
    const { result } = renderHook(() => useMotion());
    expect(result.current.reduced).toBe(false);
  });

  it('exposes reduced=true when Reduce Motion is on', () => {
    mockReduced = true;
    const { result } = renderHook(() => useMotion());
    expect(result.current.reduced).toBe(true);
  });

  it('provides timing and spring builders', () => {
    mockReduced = false;
    const { result } = renderHook(() => useMotion());
    expect(typeof result.current.timing).toBe('function');
    expect(typeof result.current.spring).toBe('function');
  });

  it('collapses timing to 0ms and spring to instant timing under Reduce Motion', () => {
    mockReduced = true;
    const { result } = renderHook(() => useMotion());
    expect(result.current.timing(1, 350)).toMatchObject({ kind: 'timing', to: 1, duration: 0 });
    expect(result.current.spring(1, 'playful')).toMatchObject({ kind: 'timing', to: 1, duration: 0 });
    mockReduced = false;
  });

  it('uses real durations and spring presets when motion is allowed', () => {
    mockReduced = false;
    const { result } = renderHook(() => useMotion());
    expect(result.current.timing(1, 350)).toMatchObject({ kind: 'timing', duration: 350 });
    expect(result.current.spring(1, 'playful')).toMatchObject({ kind: 'spring', damping: 12, stiffness: 280 });
  });
});
