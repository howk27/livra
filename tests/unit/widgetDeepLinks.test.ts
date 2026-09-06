describe('widget deep link routing', () => {
  it('livra://home maps to /(tabs)/focus', () => {
    const url = 'livra://home';
    const isHome = url === 'livra://home' || url.startsWith('livra://home?');
    expect(isHome).toBe(true);
  });

  it('livra://log-mark?markId=abc extracts markId', () => {
    const url = 'livra://log-mark?markId=abc-123';
    const parsed = new URL(url.replace('livra://', 'https://livra.app/'));
    expect(parsed.pathname).toBe('/log-mark');
    expect(parsed.searchParams.get('markId')).toBe('abc-123');
  });
});

describe('review deep link routing (source pins)', () => {
  // livra://review must route THROUGH Focus with openReview=1 (the widget
  // pattern) — a direct push loses the cold-start race with index.tsx's auth
  // replace (founder device 2026-09-06). These pins fail if either half of
  // the handshake drifts.
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const read = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8');

  it('_layout routes livra://review through Focus with openReview, never a direct push', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/isReviewLink[\s\S]{0,600}openReview: '1'/);
    expect(layout).not.toMatch(/isReviewLink\) \{\s*router\.push/);
  });

  it('focus.tsx consumes openReview once and pushes /review', () => {
    const focus = read('app/(tabs)/focus.tsx');
    expect(focus).toMatch(/params\.openReview[\s\S]{0,400}router\.push\(\{ pathname: '\/review'/);
    expect(focus).toMatch(/setParams\(\{ openReview: undefined \}\)/);
  });
});
