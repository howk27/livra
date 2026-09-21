// Founder device 2026-09-21: the Weekly Review's X did nothing. Its handler was
// a bare router.back(), which is a silent no-op when the screen has nothing
// under it (opened from a notification or a link on a cold start). A close
// control must always leave the screen.
import { readFileSync } from 'fs';
import { join } from 'path';
import { closeOrHome } from '../../lib/navigation/closeOrHome';

function fakeRouter(canGoBack: boolean) {
  return { canGoBack: () => canGoBack, back: jest.fn(), replace: jest.fn() };
}

describe('closeOrHome', () => {
  it('goes back when there is a screen underneath', () => {
    const r = fakeRouter(true);
    closeOrHome(r);
    expect(r.back).toHaveBeenCalledTimes(1);
    expect(r.replace).not.toHaveBeenCalled();
  });

  it('lands on Focus when there is nothing to go back to', () => {
    const r = fakeRouter(false);
    closeOrHome(r);
    expect(r.back).not.toHaveBeenCalled();
    expect(r.replace).toHaveBeenCalledWith('/(tabs)/focus');
  });
});

describe('review screen close wiring', () => {
  const src = readFileSync(join(__dirname, '../../app/review/index.tsx'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

  it('closes through closeOrHome, never a bare router.back()', () => {
    expect(src).toMatch(/closeOrHome\(router\)/);
    expect(src).not.toMatch(/router\.back\(\)/);
  });
});
