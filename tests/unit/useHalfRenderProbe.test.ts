/**
 * QC2-D — useHalfRenderProbe contract.
 *
 * The dev-only diagnostic must log the container/window heights on layout,
 * flag a container under 75% of the window as a native-measurement failure,
 * and stay silent about full-height containers.
 */
import { renderHook } from '@testing-library/react-native';
import { Dimensions, type LayoutChangeEvent } from 'react-native';

import { useHalfRenderProbe } from '../../hooks/useHalfRenderProbe';

const layoutEvent = (height: number) =>
  ({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } }) as LayoutChangeEvent;

describe('useHalfRenderProbe', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the tag with container and window heights', () => {
    const { result } = renderHook(() => useHalfRenderProbe('goal/new'));
    result.current(layoutEvent(790));
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0] as string;
    expect(line).toContain('[half-render-probe] goal/new');
    expect(line).toContain('790pt');
    expect(line).toContain('844pt');
  });

  it('does not flag a full-height pageSheet container (window minus sheet offset)', () => {
    const { result } = renderHook(() => useHalfRenderProbe('goal/new'));
    result.current(layoutEvent(790));
    expect(log.mock.calls[0][0]).not.toContain('CONTAINER SHORT');
  });

  it('flags a container under 75% of the window as native mis-measurement', () => {
    const { result } = renderHook(() => useHalfRenderProbe('goal/suggest'));
    result.current(layoutEvent(420)); // ~half the window — the reported symptom
    expect(log.mock.calls[0][0]).toContain('CONTAINER SHORT');
  });

  it('returns a stable callback across re-renders for the same tag', () => {
    const { result, rerender } = renderHook(() => useHalfRenderProbe('goal/new'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
