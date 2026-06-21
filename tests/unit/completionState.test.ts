import { resolveCompletionState } from '../../lib/completionState';
import type { Goal } from '../../types/goal';
const g = (o: Partial<Goal>): Goal => ({ id:'x', user_id:'u', title:'t', sort_index:0, status:'active', current_mark_count:0, created_at:'', updated_at:'', ...o });

test('all-complete when no active and >=1 completed', () => {
  expect(resolveCompletionState([g({ status: 'completed' })])).toBe('all-complete');
});
test('has-active when an active goal remains', () => {
  expect(resolveCompletionState([g({ status: 'active' }), g({ status: 'completed' })])).toBe('has-active');
});
test('has-active when there are no goals at all', () => {
  expect(resolveCompletionState([])).toBe('has-active');
});
