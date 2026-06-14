-- Goals table: primary completion via mark count, secondary via deadline
-- STATUS: APPLIED 2026-06-14 — verified live: goals + goal_mark_links tables present.
-- Apply after the counters→marks rename (20260602_rename_counters_to_marks.sql);
-- the goal_mark_links FK targets public.marks.

create table if not exists public.goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  icon text,
  color text,
  sort_index integer not null default 0,
  status text not null default 'queued'
    check (status in ('active', 'queued', 'completed', 'expired', 'paused')),
  target_mark_count integer,
  current_mark_count integer not null default 0,
  deadline_date timestamptz,
  completed_at timestamptz,
  milestones_fired jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_goals_user_updated
  on public.goals (user_id, updated_at desc);

create index if not exists idx_goals_user_active
  on public.goals (user_id)
  where status in ('active', 'queued');

alter table public.goals enable row level security;

drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals"
  on public.goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Goal-mark links: many-to-many (one mark can feed multiple goals simultaneously)
create table if not exists public.goal_mark_links (
  id uuid primary key,
  goal_id uuid not null references public.goals(id) on delete cascade,
  mark_id uuid not null references public.marks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(goal_id, mark_id)
);

create index if not exists idx_goal_mark_links_goal
  on public.goal_mark_links (goal_id);

create index if not exists idx_goal_mark_links_mark
  on public.goal_mark_links (mark_id);

alter table public.goal_mark_links enable row level security;

drop policy if exists "Users manage own goal_mark_links" on public.goal_mark_links;
create policy "Users manage own goal_mark_links"
  on public.goal_mark_links for all
  using (
    auth.uid() = (select user_id from public.goals where id = goal_id)
  )
  with check (
    auth.uid() = (select user_id from public.goals where id = goal_id)
  );
