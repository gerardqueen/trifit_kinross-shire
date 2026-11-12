-- ============================================================
-- TRI FIT Kinross-shire: tracked lifts and tests, with PB history
-- Coaches choose what is tracked. Members log dated results, so the portal can show each
-- person their improvement over time as a percentage.
-- Run after 002_portal.sql. Safe to run more than once. Choose "Run without RLS" if asked:
-- row level security is switched on below.
-- ============================================================

-- What can be tracked. kind: lift (kg), time (seconds, lower is better), reps.
-- distance_m is the length of a timed test, used to show a pace per 500m.
-- The name is what coaches write inside curly brackets in a session, e.g. {80% Back Squat}.
create table if not exists public.tf_benchmark_defs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 1 and 40 and name !~ '[{}/%]'),
  kind       text not null default 'lift' check (kind in ('lift','time','reps')),
  distance_m integer check (distance_m is null or distance_m between 1 and 100000),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tf_benchmark_defs enable row level security;

-- Every result a member logs, with its date. Their PB is the best one.
create table if not exists public.tf_benchmark_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  value      numeric not null check (value > 0 and value < 1000000),
  day        date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.tf_benchmark_log enable row level security;
create index if not exists tf_benchmark_log_user on public.tf_benchmark_log (user_id, name, day);

drop policy if exists "tf_benchmark_defs read" on public.tf_benchmark_defs;
create policy "tf_benchmark_defs read" on public.tf_benchmark_defs for select using (public.tf_is_active());
drop policy if exists "tf_benchmark_defs staff write" on public.tf_benchmark_defs;
create policy "tf_benchmark_defs staff write" on public.tf_benchmark_defs
  for all using (public.tf_is_staff()) with check (public.tf_is_staff());

-- Results are private: only the member who logged them can read or change them.
drop policy if exists "tf_benchmark_log own" on public.tf_benchmark_log;
create policy "tf_benchmark_log own" on public.tf_benchmark_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.tf_is_active());

revoke all on public.tf_benchmark_defs, public.tf_benchmark_log from anon;
grant select, insert, update, delete on public.tf_benchmark_defs, public.tf_benchmark_log to authenticated;

insert into public.tf_benchmark_defs (name, kind, distance_m, sort)
select * from (values
  ('Back Squat', 'lift', null::integer, 1), ('Front Squat', 'lift', null, 2), ('Deadlift', 'lift', null, 3),
  ('Clean & Jerk', 'lift', null, 4), ('Snatch', 'lift', null, 5), ('Strict Press', 'lift', null, 6), ('Bench Press', 'lift', null, 7),
  ('2k Row', 'time', 2000, 8), ('500m Row', 'time', 500, 9), ('5k Row', 'time', 5000, 10),
  ('1k Ski', 'time', 1000, 11), ('1k Run', 'time', 1000, 12), ('5k Run', 'time', 5000, 13)
) v
where not exists (select 1 from public.tf_benchmark_defs);

-- Carry over any PBs saved before history existed (the earlier single-value list).
insert into public.tf_benchmark_log (user_id, name, value, day)
select b.user_id, b.name, b.value, b.updated_at::date from public.tf_benchmarks b
where not exists (select 1 from public.tf_benchmark_log l where l.user_id = b.user_id and l.name = b.name);
