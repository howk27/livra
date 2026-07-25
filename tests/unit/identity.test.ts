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
  it('13th log opening a 4th week does not re-fire identity', () =>
    expect(milestoneForLog('m1', [...spread, ev('2026-07-27')])).toBeNull());
  it('fact not masked: 20th log opening a 4th+ week returns fact-20', () => {
    // 20 logs with weeks spread: ensure the 20th log opens a new week
    const events = [
      ...['06','07','08','09','10'].map((d) => ev(`2026-07-${d}`)), // wk1: 5 logs
      ...['13','14','15','16','17'].map((d) => ev(`2026-07-${d}`)), // wk2: 5 logs
      ...['20','21','22','23','24'].map((d) => ev(`2026-07-${d}`)), // wk3: 5 logs
      ...['27','28','29','30','31'].map((d) => ev(`2026-07-${d}`)), // wk4: 5 logs = 20 total
    ];
    expect(milestoneForLog('m1', events)).toEqual({ id: 'fact-20', tier: 'fact', n: 20 });
  });
  it('crossing via week bar: 13+ logs/2 weeks + log opening 3rd week fires identity, next log in that week → null', () => {
    // Build 14 logs across 2 weeks (wk1: 7, wk2: 7)
    const dense2weeks = [
      ...['06','07','08','09','10','11','12'].map((d) => ev(`2026-07-${d}`)), // wk1: 7 logs
      ...['13','14','15','16','17','18','19'].map((d) => ev(`2026-07-${d}`)), // wk2: 7 logs = 14 total
    ];
    // 14 logs in 2 weeks, doesn't fire identity
    expect(milestoneForLog('m1', dense2weeks)).toBeNull();
    // The 15th log opens wk3 (2026-07-20 is Monday of wk3)
    const with3rdWeekCrossing = [...dense2weeks, ev('2026-07-20')]; // opens wk3, total=15
    expect(milestoneForLog('m1', with3rdWeekCrossing)).toEqual({ id: 'identity-12w3', tier: 'identity', n: 15 });
    // The 16th log in wk3 does not re-fire
    const nextInWk3 = [...with3rdWeekCrossing, ev('2026-07-21')]; // same wk3
    expect(milestoneForLog('m1', nextInWk3)).toBeNull();
  });
});
