import {
  selectNextStep,
  isFeasibleNow,
  resolveTimeAffinity,
  type NextStepCandidate,
} from '../../lib/nextStep';

const at = (hour: number) => new Date(2026, 6, 11, hour, 0, 0);
const cand = (over: Partial<NextStepCandidate>): NextStepCandidate => ({
  markId: 'm1',
  name: 'Run',
  weeklyCount: 0,
  weeklyTarget: 3,
  loggedToday: false,
  timeAffinity: 'anytime',
  ...over,
});

describe('isFeasibleNow', () => {
  it('daytime marks stop at 20:00', () => {
    expect(isFeasibleNow('daytime', at(19))).toBe(true);
    expect(isFeasibleNow('daytime', at(20))).toBe(false);
  });
  it('evening marks start at 16:00', () => {
    expect(isFeasibleNow('evening', at(15))).toBe(false);
    expect(isFeasibleNow('evening', at(16))).toBe(true);
  });
  it('anytime is always feasible', () => {
    expect(isFeasibleNow('anytime', at(3))).toBe(true);
  });
});

describe('selectNextStep', () => {
  it('picks the most-behind due mark', () => {
    const r = selectNextStep(
      [
        cand({ markId: 'a', name: 'Run', weeklyCount: 2, weeklyTarget: 3 }),
        cand({ markId: 'b', name: 'Read', weeklyCount: 0, weeklyTarget: 3 }),
      ],
      at(10),
    );
    expect(r).toEqual({ kind: 'step', candidate: expect.objectContaining({ markId: 'b' }) });
  });

  it('breaks ties by array order', () => {
    const r = selectNextStep(
      [
        cand({ markId: 'a', weeklyCount: 1, weeklyTarget: 3 }),
        cand({ markId: 'b', weeklyCount: 1, weeklyTarget: 3 }),
      ],
      at(10),
    );
    expect(r.kind).toBe('step');
    if (r.kind === 'step') expect(r.candidate.markId).toBe('a');
  });

  it('skips marks already logged today (promotion after log)', () => {
    const r = selectNextStep(
      [cand({ markId: 'a', loggedToday: true }), cand({ markId: 'b', name: 'Read' })],
      at(10),
    );
    expect(r.kind).toBe('step');
    if (r.kind === 'step') expect(r.candidate.markId).toBe('b');
  });

  it('10pm with only a daytime Run due returns tomorrow', () => {
    const r = selectNextStep([cand({ timeAffinity: 'daytime' })], at(22));
    expect(r).toEqual({ kind: 'tomorrow', candidate: expect.objectContaining({ name: 'Run' }) });
  });

  it('all due marks done for the week returns allClear', () => {
    const r = selectNextStep([cand({ weeklyCount: 3, weeklyTarget: 3 })], at(10));
    expect(r).toEqual({ kind: 'allClear' });
  });

  it('every due mark already logged today returns allClear', () => {
    const r = selectNextStep([cand({ loggedToday: true })], at(10));
    expect(r).toEqual({ kind: 'allClear' });
  });

  it('empty candidate list returns allClear', () => {
    expect(selectNextStep([], at(10))).toEqual({ kind: 'allClear' });
  });
});

describe('resolveTimeAffinity', () => {
  it('maps a known daytime mark by emoji', () => {
    expect(resolveTimeAffinity({ name: 'Run', emoji: '🏃' })).toBe('daytime');
  });
  it('maps a known evening mark by emoji', () => {
    expect(resolveTimeAffinity({ name: 'Sleep', emoji: '🌙' })).toBe('evening');
  });
  it('defaults custom/unknown to anytime', () => {
    expect(resolveTimeAffinity({ name: 'Feed the raptor', emoji: '🦖' })).toBe('anytime');
    expect(resolveTimeAffinity(null)).toBe('anytime');
  });

  // The siblings of the sleep bug: ways the gate used to be skipped silently.
  it('gates a mark that has NO emoji at all — Mark.emoji is optional', () => {
    expect(resolveTimeAffinity({ name: 'Sleep' })).toBe('evening');
    expect(resolveTimeAffinity({ name: 'Run', emoji: null })).toBe('daytime');
  });
  it('trusts the name over a stale or reassigned emoji', () => {
    expect(resolveTimeAffinity({ name: 'Sleep', emoji: '🦖' })).toBe('evening');
  });
  it('still resolves an AI-named mark by its copied emoji', () => {
    expect(resolveTimeAffinity({ name: 'Nightly wind-down', emoji: '🌙' })).toBe('evening');
  });
});
