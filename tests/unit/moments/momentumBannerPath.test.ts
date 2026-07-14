// PL-2 M3: the MomentumBanner copy path. Focus composes three pieces, each pure:
// shouldShowMomentumBanner (visibility + once/day dismissal) → selectMoment
// ('momentumBanner', ctx) for the direct why line → getMomentumBannerCopy fallback.
// These tests pin the seam the screen wires together.
import { selectMoment } from '../../../lib/moments/select';
import { buildMomentContext } from '../../../lib/moments/context';
import { shouldShowMomentumBanner } from '../../../lib/momentumPresenter';
import { getMomentumBannerCopy } from '../../../lib/copy';
import type { MomentumSnapshot } from '../../../lib/goalMomentum';

const TODAY = '2026-07-14';

const slippingSnap: MomentumSnapshot = {
  state: 'slipping',
  days: 9,
  cushionRemaining: 0.4,
  slippingMarkId: 'm1',
};

function ctxWith(description: string | undefined) {
  return buildMomentContext({
    goals: [
      { id: 'g1', title: 'Run a marathon', description, created_at: '2026-06-01', status: 'active' },
    ],
    snapshots: { g1: slippingSnap },
    weeklyCounts: {},
    todayCounts: {},
    dueMarkIds: [],
    todayStr: TODAY,
  });
}

describe('banner path selection (PL-2 M3)', () => {
  it('why present → the engine supplies the direct line, said back plainly', () => {
    const m = selectMoment('momentumBanner', ctxWith('I want to feel strong at 40'));
    expect(m).not.toBeNull();
    expect(m!.type).toBe('whyResurface');
    expect(m!.text).toBe("You wrote: 'I want to feel strong at 40'. One check-in keeps it alive.");
  });

  it('no why stored → engine returns null; the existing generic copy carries the banner', () => {
    expect(selectMoment('momentumBanner', ctxWith(undefined))).toBeNull();
    const fallback = getMomentumBannerCopy();
    expect(fallback.text.length).toBeGreaterThan(0);
  });

  it('dismissal is respected by the existing machinery: dismissed today → no banner at all', () => {
    const snapshots = { g1: slippingSnap };
    expect(shouldShowMomentumBanner(snapshots, TODAY, TODAY)).toBe(false); // dismissed today
    expect(shouldShowMomentumBanner(snapshots, '2026-07-13', TODAY)).toBe(true); // dismissed yesterday
    expect(shouldShowMomentumBanner(snapshots, null, TODAY)).toBe(true);
  });

  it('the direct line carries no loss language, countdowns, or guilt vocabulary', () => {
    const m = selectMoment('momentumBanner', ctxWith('finish my first 10k'))!;
    expect(m.text).not.toMatch(/lose|lost|losing|gone|reset|last chance|only \d|left|hurry/i);
    expect(m.text).not.toMatch(/!/);
    expect(m.text).not.toMatch(/[—–]| - /);
  });

  it('a long why is truncated by fillTemplate (≤ 80 chars, ellipsis)', () => {
    const longWhy = 'w'.repeat(120);
    const m = selectMoment('momentumBanner', ctxWith(longWhy))!;
    const quoted = m.text.match(/'([^']*)'/)![1]!;
    expect(quoted.length).toBeLessThanOrEqual(80);
    expect(quoted.endsWith('…')).toBe(true);
  });
});

describe('celebration threshold matrix through the greeting surface (PL-2 M2)', () => {
  function greetingFor(days: number, personalBest: number | null) {
    const ctx = buildMomentContext({
      goals: [
        { id: 'g1', title: 'Run a marathon', created_at: '2026-05-01', status: 'active' },
      ],
      snapshots: {
        g1: { state: 'on_track', days, cushionRemaining: null, slippingMarkId: null },
      },
      weeklyCounts: {},
      todayCounts: {},
      dueMarkIds: [],
      todayStr: TODAY,
      personalBestRuns: { g1: personalBest },
    });
    return selectMoment('greeting', ctx, { rng: () => 0 });
  }

  type Row = [name: string, days: number, best: number | null, celebrates: boolean];
  const rows: Row[] = [
    ['run reaches 7', 7, null, true],
    ['run reaches 14', 14, null, true],
    ['run reaches 30', 30, null, true],
    ['day after a threshold stays quiet', 8, null, false],
    ['new personal best past the floor', 10, 9, true],
    ['floor: beating a 5 day best does not read as a record', 6, 5, false],
    ['floor boundary: beating a 7 day best does', 8, 7, true],
    ['equal to the best is not a record', 9, 9, false],
    ['ordinary mid-run day stays quiet', 11, null, false],
  ];

  it.each(rows)('%s', (_name, days, best, celebrates) => {
    const m = greetingFor(days, best);
    if (celebrates) {
      expect(m!.type).toBe('celebration');
    } else {
      // greeting always speaks; a non-celebration day falls to the default pool
      expect(m!.type).not.toBe('celebration');
    }
  });

  it('threshold + record on the same day prefers the record line', () => {
    const m = greetingFor(14, 12)!;
    expect(m.type).toBe('celebration');
    expect(m.id).toContain('newBest');
    expect(m.text).toContain('14 days');
    expect(m.text).toContain('Your longest yet');
  });
});
