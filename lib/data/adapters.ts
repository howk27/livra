// lib/data/adapters.ts
//
// Row → domain-model adapters for NON-SCREEN consumers of the query layer.
//
// The Phase 2 screens each carry their own copy of these ("the strangler seam is
// bridged HERE") and keep them until the children are retyped against rows. This
// module exists so code that is not a screen — the widget snapshot builder first —
// does not grow a sixth hand-rolled copy. Field-for-field identical to the
// canonical copies in app/(tabs)/goals.tsx.

import type { Goal } from '@/types/goal';
import type { Mark, MarkEvent, FrequencyKind } from '@/types';
import type { GoalRow, MarkRow, MarkEventRow } from '@/lib/data/types';
import type { TierId, FrequencyId } from '@/lib/goalMarkSuggestions';
import { resolveRowCadence } from '@/lib/markCadence';

export function toGoal(row: GoalRow, linkedMarkIds: string[]): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    sort_index: row.sort_index,
    status: row.status as Goal['status'],
    target_mark_count: row.target_mark_count,
    current_mark_count: row.current_mark_count,
    deadline_date: row.deadline_date,
    // The server dropped `target_date`; the old store kept it in lock-step with
    // `deadline_date`, so mirroring it keeps consumers identical.
    target_date: row.deadline_date,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    milestones_fired: Array.isArray(row.milestones_fired)
      ? (row.milestones_fired as string[])
      : undefined,
    banked_momentum_days: row.banked_momentum_days,
    linked_mark_ids: linkedMarkIds,
    tier: (row.tier ?? undefined) as TierId | undefined,
    frequency: (row.frequency ?? undefined) as FrequencyId | undefined,
    deleted_at: row.deleted_at,
  };
}

// `total` is DERIVED from the event log (M9 Phase 4); callers pass a totals map
// computed via lib/data/derived.ts.
export function toMark(row: MarkRow, totals: ReadonlyMap<string, number>): Mark {
  const cadence = resolveRowCadence(row, row);
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    color: row.color ?? undefined,
    unit: (row.unit ?? 'sessions') as Mark['unit'],
    enable_streak: row.enable_streak ?? false,
    sort_index: row.sort_index ?? 0,
    total: totals.get(row.id) ?? 0,
    last_activity_date: row.last_activity_date ?? undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    maintenance_of: row.maintenance_of,
    frequency_min: cadence.frequency_min,
    frequency_recommended: cadence.frequency_recommended,
    frequency_max: cadence.frequency_max,
    weekly_target: cadence.weekly_target,
    dailyTarget: row.dailyTarget,
    frequency_kind: cadence.frequency_kind,
  };
}

export function toMarkEvent(row: MarkEventRow): MarkEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.mark_id,
    event_type: row.event_type as MarkEvent['event_type'],
    amount: row.amount ?? 1,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}
