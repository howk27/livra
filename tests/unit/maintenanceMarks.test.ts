import { isMaintenanceMark, partitionMarks } from '../../lib/maintenanceMarks';

describe('isMaintenanceMark', () => {
  test('true when maintenance_of set and not deleted', () => {
    expect(isMaintenanceMark({ maintenance_of: 'g1', deleted_at: null })).toBe(true);
  });
  test('false when maintenance_of absent', () => {
    expect(isMaintenanceMark({ goal_id: 'g1', deleted_at: null })).toBe(false);
  });
  test('false when maintenance_of set but soft-deleted', () => {
    expect(isMaintenanceMark({ maintenance_of: 'g1', deleted_at: '2026-01-01' })).toBe(false);
  });
});

describe('partitionMarks', () => {
  const marks = [
    { id: 'a1', goal_id: 'G', maintenance_of: null, deleted_at: null }, // active-by-goal
    { id: 'a2', goal_id: 'G', maintenance_of: null, deleted_at: null }, // active-by-goal
    { id: 'l1', goal_id: null, maintenance_of: null, deleted_at: null }, // loose
    { id: 'm1', goal_id: null, maintenance_of: 'OLD', deleted_at: null }, // maintenance
    { id: 'x1', goal_id: null, maintenance_of: 'OLD', deleted_at: 'now' }, // deleted maintenance — dropped
  ];

  test('groups active-by-goal marks', () => {
    expect(partitionMarks(marks).activeByGoal.map((m) => m.id)).toEqual(['a1', 'a2']);
  });
  test('groups loose marks (no goal, not maintenance)', () => {
    expect(partitionMarks(marks).loose.map((m) => m.id)).toEqual(['l1']);
  });
  test('groups maintenance marks, excluding deleted ones', () => {
    expect(partitionMarks(marks).maintenance.map((m) => m.id)).toEqual(['m1']);
  });
  test('maintenance takes precedence over loose for a null-goal maintenance mark', () => {
    const result = partitionMarks([{ id: 'm', goal_id: null, maintenance_of: 'OLD', deleted_at: null }]);
    expect(result.loose).toHaveLength(0);
    expect(result.maintenance).toHaveLength(1);
  });
});
