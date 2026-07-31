-- STATUS: APPLIED to production 2026-07-31 via MCP execute_sql, and VERIFIED by
-- reading pg_get_functiondef back (the header rule: never trust this line without
-- re-reading pg_proc — this file was written only after the read-back).
--
-- THE DEFECT, measured live during the M9 Phase 3 Task 6 Step 5 acceptance run:
-- livra_count_other_active_goals counted `status NOT IN ('completed','expired')`
-- with NO deleted_at filter. An archived goal keeps status='active' and only
-- gains a deleted_at stamp, so it held its free-tier slot FOREVER: a free user
-- at the 2-goal cap who deleted a goal could never create another. The
-- delete-and-recreate sequence — the exact build-60 defect Phase 3 exists to fix —
-- was refused with 42501 on the recreate, from a second, independent cause.
--
-- The mark counters (livra_count_other_active_marks,
-- livra_count_other_marks_for_goal) already filter deleted_at IS NULL; the goals
-- counter was the one outlier. This change only LOOSENS the cap to its documented
-- meaning ("2 goals at once"), matching the client-side canAddGoal pre-check,
-- which counts live non-completed goals only. Build-60 clients are unaffected
-- except that previously-refused recreates now succeed.

CREATE OR REPLACE FUNCTION public.livra_count_other_active_goals(p_user uuid, p_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.goals
  WHERE user_id = p_user
    AND status NOT IN ('completed', 'expired')
    AND deleted_at IS NULL   -- 2026-07-31: archived goals must free their slot
    AND id <> p_id;   -- self-exclusion = upsert-safe
$function$;
