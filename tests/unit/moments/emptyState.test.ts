import {
  deriveEmptyVariant,
  deriveFocusEmptyVariant,
  deriveGoalDetailEmptyVariant,
  deriveGoalsEmptyKind,
  deriveGoalsEmptyVariant,
  getEmptyStateCopy,
} from '../../../lib/moments/emptyState';
import { MOMENT_CONTENT } from '../../../lib/moments/content';
import { selectMoment } from '../../../lib/moments/select';
import type { MomentContext } from '../../../lib/moments/types';

const mark = (over: Partial<{ id: string; goal_id: string | null; deleted_at: string | null }> = {}) => ({
  id: 'm1',
  goal_id: null,
  deleted_at: null,
  ...over,
});

describe('deriveEmptyVariant (core rule)', () => {
  it('firstRun only when there is no trace at all', () => {
    expect(deriveEmptyVariant({ everHadEntities: false, everHadActivity: false })).toBe('firstRun');
  });

  it('any surviving entity trace means returnedEmpty', () => {
    expect(deriveEmptyVariant({ everHadEntities: true, everHadActivity: false })).toBe('returnedEmpty');
  });

  it('any activity trace means returnedEmpty', () => {
    expect(deriveEmptyVariant({ everHadEntities: false, everHadActivity: true })).toBe('returnedEmpty');
  });
});

describe('deriveFocusEmptyVariant (entity = marks)', () => {
  it('brand-new user: no marks ever, no events ever', () => {
    expect(deriveFocusEmptyVariant([], [])).toBe('firstRun');
  });

  it('a soft-deleted mark is the trace of a user who cleared out', () => {
    expect(deriveFocusEmptyVariant([mark({ deleted_at: '2026-07-01' })], [])).toBe('returnedEmpty');
  });

  it('a surviving event (even without surviving marks) means they logged once', () => {
    expect(deriveFocusEmptyVariant([], [{ mark_id: 'gone' }])).toBe('returnedEmpty');
  });
});

describe('deriveGoalsEmptyVariant / deriveGoalsEmptyKind (entity = goals)', () => {
  it('brand-new user: no goals in any status, no goal-linked marks', () => {
    expect(deriveGoalsEmptyVariant([], [])).toBe('firstRun');
    expect(deriveGoalsEmptyKind([], [])).toBe('firstRun');
  });

  it('habit-only user stays firstRun: marks without a goal_id are not goal history', () => {
    expect(deriveGoalsEmptyVariant([], [mark({ deleted_at: '2026-07-01' })])).toBe('firstRun');
  });

  it('an expired or paused goal is the trace', () => {
    expect(deriveGoalsEmptyVariant([{ status: 'expired' }], [])).toBe('returnedEmpty');
    expect(deriveGoalsEmptyVariant([{ status: 'paused' }], [])).toBe('returnedEmpty');
  });

  it('a deleted goal leaves the store but its soft-deleted marks keep the goal_id', () => {
    expect(
      deriveGoalsEmptyVariant([], [mark({ goal_id: 'g-deleted', deleted_at: '2026-07-01' })]),
    ).toBe('returnedEmpty');
  });

  it('finished-everything outranks the generic returnedEmpty', () => {
    expect(deriveGoalsEmptyKind([{ status: 'completed' }], [])).toBe('completedAll');
    expect(deriveGoalsEmptyKind([{ status: 'completed' }, { status: 'expired' }], [])).toBe('completedAll');
  });
});

describe('deriveGoalDetailEmptyVariant (entity = this goal’s marks)', () => {
  it('goal that never had a mark is firstRun', () => {
    expect(deriveGoalDetailEmptyVariant('g1', [], [])).toBe('firstRun');
  });

  it('a soft-deleted mark on THIS goal means returnedEmpty', () => {
    const marks = [mark({ goal_id: 'g1', deleted_at: '2026-07-01' })];
    expect(deriveGoalDetailEmptyVariant('g1', marks, [])).toBe('returnedEmpty');
  });

  it('an event on this goal’s mark means returnedEmpty', () => {
    const marks = [mark({ id: 'm1', goal_id: 'g1', deleted_at: '2026-07-01' })];
    expect(deriveGoalDetailEmptyVariant('g1', marks, [{ mark_id: 'm1' }])).toBe('returnedEmpty');
  });

  it('another goal’s history does not count', () => {
    const marks = [mark({ id: 'm9', goal_id: 'g2', deleted_at: '2026-07-01' })];
    expect(deriveGoalDetailEmptyVariant('g1', marks, [{ mark_id: 'm9' }])).toBe('firstRun');
  });
});

describe('getEmptyStateCopy (registry accessor)', () => {
  it('every distinguishable surface has distinct firstRun and returnedEmpty copy', () => {
    for (const surface of ['focus', 'goals', 'goalDetail'] as const) {
      const first = getEmptyStateCopy(surface, 'firstRun');
      const returned = getEmptyStateCopy(surface, 'returnedEmpty');
      expect(first.body).toBeTruthy();
      expect(returned.body).toBeTruthy();
      expect(first.body).not.toBe(returned.body);
    }
  });

  it('goals is the two-line surface: title + body for all three kinds', () => {
    for (const kind of ['firstRun', 'returnedEmpty', 'completedAll'] as const) {
      const copy = getEmptyStateCopy('goals', kind);
      expect(copy.title).toBeTruthy();
      expect(copy.body).toBeTruthy();
    }
  });

  it('single-line surfaces carry no title', () => {
    expect(getEmptyStateCopy('focus', 'firstRun').title).toBeUndefined();
    expect(getEmptyStateCopy('history').title).toBeUndefined();
  });

  it('inherently-firstRun surfaces answer any requested variant with their one line', () => {
    expect(getEmptyStateCopy('history', 'returnedEmpty').body).toBe(
      getEmptyStateCopy('history', 'firstRun').body,
    );
    expect(getEmptyStateCopy('markDetail', 'returnedEmpty').body).toBe(
      getEmptyStateCopy('markDetail', 'firstRun').body,
    );
  });

  it('all empty-state copy lives in the registry (walked by the copy-rules suite)', () => {
    const keys = Object.keys(MOMENT_CONTENT.emptyInvitation);
    for (const expected of [
      'focus.firstRun',
      'focus.returnedEmpty',
      'goals.firstRun.title',
      'goals.firstRun.body',
      'goals.returnedEmpty.title',
      'goals.returnedEmpty.body',
      'goals.completedAll.title',
      'goals.completedAll.body',
      'goalDetail.firstRun',
      'goalDetail.returnedEmpty',
      'history.firstRun',
      'markDetail.firstRun',
    ]) {
      expect(keys).toContain(expected);
    }
  });
});

describe('selectMoment emptyState routing (surface-aware since PL-5)', () => {
  const ctx: MomentContext = {
    todayStr: '2026-07-14',
    firstName: null,
    weekPosition: 1,
    logsToday: 0,
    allDoneForDay: false,
    goals: [],
    weeklyCounts: {},
    todayCounts: {},
  };

  it('routes surface + variant into the registry key', () => {
    const m = selectMoment('emptyState', ctx, {
      emptySurface: 'goalDetail',
      emptyVariant: 'returnedEmpty',
    });
    expect(m!.id).toBe('emptyInvitation.goalDetail.returnedEmpty.0');
  });

  it('two-line surfaces resolve to their body line', () => {
    const m = selectMoment('emptyState', ctx, { emptySurface: 'goals', emptyVariant: 'firstRun' });
    expect(m!.id).toBe('emptyInvitation.goals.firstRun.body.0');
  });

  it('inherently-firstRun surfaces fall back for a returnedEmpty request', () => {
    const m = selectMoment('emptyState', ctx, {
      emptySurface: 'markDetail',
      emptyVariant: 'returnedEmpty',
    });
    expect(m!.id).toBe('emptyInvitation.markDetail.firstRun.0');
  });
});
