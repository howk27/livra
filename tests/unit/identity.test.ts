// tests/unit/identity.test.ts
import { milestoneForLog } from '../../lib/identity';
import type { MarkEvent } from '../../types';

const ev = (date: string, markId = 'm1', over: Partial<MarkEvent> = {}): MarkEvent =>
  ({ id: `e-${date}-${Math.random()}`, mark_id: markId, event_type: 'increment',
     occurred_local_date: date, amount: 1, deleted_at: null, ...over } as MarkEvent);

// n logs on consecutive days starting 2026-07-01 (all within ~1–2 weeks for small n)
const nLogs = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    ev(`2026-07-${String(1 + i).padStart(2, '0')}`));

describe('fact tier', () => {
  it('3rd log crosses fact-3', () =>
    expect(milestoneForLog('m1', nLogs(3))).toEqual({ id: 'fact-3', tier: 'fact', n: 3 }));
  it('4th log crosses nothing', () =>
    expect(milestoneForLog('m1', nLogs(4))).toBeNull());
  it("other marks' events do not count", () =>
    expect(milestoneForLog('m1', [ev('2026-07-01'), ev('2026-07-02', 'OTHER'), ev('2026-07-03')]))
      .toBeNull());
  it('deleted events do not count', () =>
    expect(milestoneForLog('m1', [...nLogs(2), ev('2026-07-09', 'm1', { deleted_at: 'x' })]))
      .toBeNull());
});

describe('identity tier — ≥12 logs across ≥3 distinct Monday weeks', () => {
  // 12 logs spread over 3 ISO weeks: Jul 6–10 (wk1), Jul 13–17 (wk2), Jul 20–21 (wk3)
  const spread = [
    ...['06','07','08','09','10'].map((d) => ev(`2026-07-${d}`)),
    ...['13','14','15','16','17'].map((d) => ev(`2026-07-${d}`)),
    ...['20','21'].map((d) => ev(`2026-07-${d}`)),
  ];
  it('12th log across 3 weeks crosses identity-12w3 (outranks any fact)', () =>
    expect(milestoneForLog('m1', spread)).toEqual({ id: 'identity-12w3', tier: 'identity', n: 12 }));
  it('12 logs inside 2 weeks is NOT identity (and 12 is not a fact threshold)', () => {
    const dense = Array.from({ length: 12 }, (_, i) =>
      ev(`2026-07-${String(6 + i).padStart(2, '0')}`)); // Jul 6–17 = 2 ISO weeks
    expect(milestoneForLog('m1', dense)).toBeNull();
  });
  it('13th log does not re-fire identity', () =>
    expect(milestoneForLog('m1', [...spread, ev('2026-07-22')])).toBeNull());
});
