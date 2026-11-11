-- ============================================================
-- TRI FIT Kinross-shire: member and coach portal (app.html)
-- People and roles, programmes, workouts, scores, leaderboard, PBs, bookings.
-- Run after 001_trifit.sql. Safe to run more than once.
-- In the Supabase editor choose "Run without RLS" if it asks: this file
-- switches row level security on for everything it creates.
-- ============================================================

-- ---------- People ----------
-- One row per signed-in person. role: member or coach. Admins are the tf_admins list.
-- status: pending (signed up, waiting), active, blocked.
create table if not exists public.tf_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  email          text,
  name           text check (char_length(name) <= 80),
  role           text not null default 'member' check (role in ('member','coach')),
  status         text not null default 'pending' check (status in ('pending','active','blocked')),
  board_default  boolean not null default false,
  teamup_id      text,
  teamup_plan    text,
  teamup_status  text,
  teamup_checked_at timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.tf_profiles enable row level security;

create or replace function public.tf_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tf_is_admin() or exists (
    select 1 from public.tf_profiles where user_id = auth.uid() and role = 'coach' and status = 'active');
$$;
create or replace function public.tf_is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tf_is_staff() or exists (
    select 1 from public.tf_profiles where user_id = auth.uid() and status = 'active');
$$;

-- ---------- Programmes ----------
-- audience: members = every active member, selected = only people an admin ticks, coaches = staff only.
create table if not exists public.tf_tracks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  audience   text not null default 'members' check (audience in ('members','selected','coaches')),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tf_tracks enable row level security;
create table if not exists public.tf_track_access (
  track_id uuid not null references public.tf_tracks(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (track_id, user_id)
);
alter table public.tf_track_access enable row level security;

create or replace function public.tf_can_view_track(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tf_is_staff() or (public.tf_is_active() and exists (
    select 1 from public.tf_tracks k where k.id = t and (
      k.audience = 'members'
      or (k.audience = 'selected' and exists (
        select 1 from public.tf_track_access a where a.track_id = t and a.user_id = auth.uid())))));
$$;

-- ---------- Workouts ----------
-- tracked = members can log a score. published = members can see it.
create table if not exists public.tf_workouts (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references public.tf_tracks(id) on delete cascade,
  day        date not null,
  title      text not null check (char_length(title) between 1 and 100),
  body       text not null default '' check (char_length(body) <= 4000),
  tracked    boolean not null default false,
  score_type text not null default 'time' check (score_type in ('time','rounds_reps','reps','load','distance')),
  published  boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.tf_workouts enable row level security;
create index if not exists tf_workouts_day on public.tf_workouts (day);
-- Coach notes sit apart so members can never read them.
create table if not exists public.tf_workout_notes (
  workout_id uuid primary key references public.tf_workouts(id) on delete cascade,
  notes      text not null default '' check (char_length(notes) <= 3000)
);
alter table public.tf_workout_notes enable row level security;

-- ---------- Scores, leaderboard, high fives ----------
-- value: seconds, reps, kg or metres. For rounds and reps: rounds * 1000 + reps.
-- public = the member chose to show this score on the leaderboard.
create table if not exists public.tf_scores (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.tf_workouts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      numeric not null check (value >= 0 and value < 100000000),
  rx         boolean not null default true,
  note       text check (char_length(note) <= 200),
  public     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workout_id, user_id)
);
alter table public.tf_scores enable row level security;
create table if not exists public.tf_fives (
  score_id uuid not null references public.tf_scores(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (score_id, user_id)
);
alter table public.tf_fives enable row level security;

-- ---------- Personal bests ----------
create table if not exists public.tf_benchmarks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  value      numeric not null check (value > 0 and value < 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.tf_benchmarks enable row level security;

-- ---------- Bookings ----------
-- status: preview (TeamUp not linked yet, nothing sent), booked (confirmed by TeamUp), failed.
create table if not exists public.tf_bookings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  class_id   uuid not null references public.tf_classes(id) on delete cascade,
  day        date not null,
  status     text not null default 'preview' check (status in ('preview','booked','failed')),
  teamup_ref text,
  detail     text,
  created_at timestamptz not null default now(),
  unique (user_id, class_id, day)
);
alter table public.tf_bookings enable row level security;

-- ---------- Things people do through functions ----------
-- An email an admin added in advance becomes an admin the first time that person signs in
-- with a confirmed address, whichever page they sign in on.
create or replace function public.tf_claim_invite() returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_email text; confirmed timestamptz;
begin
  if me is null then return false; end if;
  if public.tf_is_admin() then return true; end if;
  select lower(u.email), u.email_confirmed_at into my_email, confirmed from auth.users u where u.id = me;
  if confirmed is not null and exists (select 1 from public.tf_admin_invites i where i.email = my_email) then
    insert into public.tf_admins (user_id, email) values (me, my_email) on conflict on constraint tf_admins_pkey do nothing;
    delete from public.tf_admin_invites i where i.email = my_email;
    delete from public.tf_access_requests r where r.user_id = me;
    return true;
  end if;
  return false;
end $$;

-- Makes sure the signed-in person has a profile, and returns it with their role.
create or replace function public.tf_me(p_name text default null)
returns table (user_id uuid, email text, name text, role text, status text, board_default boolean,
               teamup_plan text, teamup_status text, teamup_checked_at timestamptz, is_admin boolean)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_email text; adm boolean;
begin
  if me is null then return; end if;
  select lower(u.email) into my_email from auth.users u where u.id = me;
  adm := public.tf_claim_invite();
  insert into public.tf_profiles (user_id, email, name, status)
  values (me, my_email, nullif(trim(coalesce(p_name, '')), ''), case when adm then 'active' else 'pending' end)
  on conflict on constraint tf_profiles_pkey do nothing;
  if adm then update public.tf_profiles p set status = 'active' where p.user_id = me and p.status = 'pending'; end if;
  return query select p.user_id, p.email, p.name,
    case when adm then 'admin' else p.role end, p.status, p.board_default,
    p.teamup_plan, p.teamup_status, p.teamup_checked_at, adm
  from public.tf_profiles p where p.user_id = me;
end $$;

-- A person can change their own name and leaderboard preference, nothing else.
create or replace function public.tf_update_me(p_name text, p_board_default boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.tf_profiles set name = nullif(left(trim(coalesce(p_name, '')), 80), ''), board_default = coalesce(p_board_default, false)
  where user_id = auth.uid();
end $$;

-- Admins set role, status and which selected-only programmes a person can see.
create or replace function public.tf_set_person(p_user uuid, p_role text, p_status text, p_tracks uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tf_is_admin() then raise exception 'Only admins can change people'; end if;
  update public.tf_profiles set role = p_role, status = p_status where user_id = p_user;
  delete from public.tf_track_access where user_id = p_user;
  insert into public.tf_track_access (track_id, user_id)
  select t, p_user from unnest(coalesce(p_tracks, '{}')) t where exists (select 1 from public.tf_tracks k where k.id = t);
end $$;

-- The leaderboard for one workout: public scores, plus your own even if private.
create or replace function public.tf_leaderboard(p_workout uuid)
returns table (score_id uuid, name text, value numeric, rx boolean, note text, is_public boolean, is_me boolean, fives integer, i_fived boolean)
language sql stable security definer set search_path = public as $$
  select s.id, coalesce(p.name, 'Member'), s.value, s.rx, s.note, s.public, s.user_id = auth.uid(),
    (select count(*)::int from public.tf_fives f where f.score_id = s.id),
    exists (select 1 from public.tf_fives f where f.score_id = s.id and f.user_id = auth.uid())
  from public.tf_scores s
  join public.tf_workouts w on w.id = s.workout_id
  left join public.tf_profiles p on p.user_id = s.user_id
  where s.workout_id = p_workout
    and (public.tf_is_staff() or (w.published and public.tf_can_view_track(w.track_id)))
    and (s.public or s.user_id = auth.uid());
$$;

create or replace function public.tf_toggle_five(p_score uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (
    select 1 from public.tf_scores s join public.tf_workouts w on w.id = s.workout_id
    where s.id = p_score and s.public and s.user_id <> me
      and (public.tf_is_staff() or (w.published and public.tf_can_view_track(w.track_id)))
  ) then return; end if;
  if exists (select 1 from public.tf_fives where score_id = p_score and user_id = me) then
    delete from public.tf_fives where score_id = p_score and user_id = me;
  else
    insert into public.tf_fives (score_id, user_id) values (p_score, me);
  end if;
end $$;

-- ---------- Who can do what ----------
drop policy if exists "tf_profiles read" on public.tf_profiles;
create policy "tf_profiles read" on public.tf_profiles for select using (user_id = auth.uid() or public.tf_is_admin());
drop policy if exists "tf_profiles admin write" on public.tf_profiles;
create policy "tf_profiles admin write" on public.tf_profiles for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_tracks read" on public.tf_tracks;
create policy "tf_tracks read" on public.tf_tracks for select using (public.tf_can_view_track(id));
drop policy if exists "tf_tracks admin write" on public.tf_tracks;
create policy "tf_tracks admin write" on public.tf_tracks for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_track_access read" on public.tf_track_access;
create policy "tf_track_access read" on public.tf_track_access for select using (user_id = auth.uid() or public.tf_is_admin());
drop policy if exists "tf_track_access admin write" on public.tf_track_access;
create policy "tf_track_access admin write" on public.tf_track_access for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_workouts read" on public.tf_workouts;
create policy "tf_workouts read" on public.tf_workouts for select
  using (public.tf_is_staff() or (published and public.tf_can_view_track(track_id)));
drop policy if exists "tf_workouts staff write" on public.tf_workouts;
create policy "tf_workouts staff write" on public.tf_workouts for all using (public.tf_is_staff()) with check (public.tf_is_staff());

drop policy if exists "tf_workout_notes staff" on public.tf_workout_notes;
create policy "tf_workout_notes staff" on public.tf_workout_notes for all using (public.tf_is_staff()) with check (public.tf_is_staff());

drop policy if exists "tf_scores own read" on public.tf_scores;
create policy "tf_scores own read" on public.tf_scores for select using (user_id = auth.uid());
drop policy if exists "tf_scores own insert" on public.tf_scores;
create policy "tf_scores own insert" on public.tf_scores for insert with check (
  user_id = auth.uid() and exists (select 1 from public.tf_workouts w
    where w.id = workout_id and w.tracked and (public.tf_is_staff() or (w.published and public.tf_can_view_track(w.track_id)))));
drop policy if exists "tf_scores own update" on public.tf_scores;
create policy "tf_scores own update" on public.tf_scores for update using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.tf_workouts w
    where w.id = workout_id and w.tracked and (public.tf_is_staff() or (w.published and public.tf_can_view_track(w.track_id)))));
drop policy if exists "tf_scores own delete" on public.tf_scores;
create policy "tf_scores own delete" on public.tf_scores for delete using (user_id = auth.uid());

drop policy if exists "tf_benchmarks own" on public.tf_benchmarks;
create policy "tf_benchmarks own" on public.tf_benchmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tf_bookings own read" on public.tf_bookings;
create policy "tf_bookings own read" on public.tf_bookings for select using (user_id = auth.uid() or public.tf_is_admin());
drop policy if exists "tf_bookings own preview" on public.tf_bookings;
create policy "tf_bookings own preview" on public.tf_bookings for insert
  with check (user_id = auth.uid() and status = 'preview' and teamup_ref is null and public.tf_is_active());
drop policy if exists "tf_bookings own delete" on public.tf_bookings;
create policy "tf_bookings own delete" on public.tf_bookings for delete using (user_id = auth.uid() and status <> 'booked');

revoke all on public.tf_profiles, public.tf_tracks, public.tf_track_access, public.tf_workouts, public.tf_workout_notes,
  public.tf_scores, public.tf_fives, public.tf_benchmarks, public.tf_bookings from anon;
grant select, insert, update, delete on public.tf_profiles, public.tf_tracks, public.tf_track_access, public.tf_workouts,
  public.tf_workout_notes, public.tf_scores, public.tf_benchmarks, public.tf_bookings to authenticated;
revoke execute on function public.tf_claim_invite() from public, anon;
grant execute on function public.tf_claim_invite() to authenticated;
revoke execute on function public.tf_is_staff(), public.tf_is_active(), public.tf_can_view_track(uuid), public.tf_me(text),
  public.tf_update_me(text, boolean), public.tf_set_person(uuid, text, text, uuid[]), public.tf_leaderboard(uuid),
  public.tf_toggle_five(uuid) from public, anon;
grant execute on function public.tf_is_staff(), public.tf_is_active(), public.tf_can_view_track(uuid), public.tf_me(text),
  public.tf_update_me(text, boolean), public.tf_set_person(uuid, text, text, uuid[]), public.tf_leaderboard(uuid),
  public.tf_toggle_five(uuid) to authenticated;

-- ---------- Starting content ----------
insert into public.tf_tracks (name, audience, sort)
select * from (values ('TRI FIT classes', 'members', 1), ('HYROX', 'members', 2), ('Coaches only', 'coaches', 3)) v
where not exists (select 1 from public.tf_tracks);

-- Sample sessions for the week of 9 Nov 2026 so there is something to look at. Edit or delete them
-- from the Programming tab. Percentages in curly brackets become each member's own numbers.
insert into public.tf_workouts (track_id, day, title, body, tracked, score_type, published)
select k.id, v.day::date, v.title, v.body, v.tracked, v.score_type, true
from (values
  ('TRI FIT classes', '2026-11-09', 'Sample: Squat and press', 'A. Back squat 5 x 3 @ {82.5% Back Squat}, rest 2:30
B. Strict press 4 x 6 @ {70% Strict Press}
C. 3 rounds: 12 walking lunges, 10 hollow rocks, 250m row @ {65% 2k Row /500m}', false, 'time'),
  ('TRI FIT classes', '2026-11-10', 'Sample: Loch Leven', 'A. Every 90 seconds x 8: 1 clean and jerk @ {75% Clean & Jerk}
B. AMRAP 12: 12 cal row, 9 toes-to-bar, 6 power cleans @ {60% Clean & Jerk}', true, 'rounds_reps'),
  ('TRI FIT classes', '2026-11-11', 'Sample: Positions and engine', 'A. 12 minutes: wall walks and handstand holds
B. 3 x 1000m row @ {75% 2k Row /500m}, rest 2:00, stroke rate 22 to 24', false, 'time'),
  ('TRI FIT classes', '2026-11-12', 'Sample: Deadlift and sprint', 'A. Deadlift 5 x 5 @ {75% Deadlift}
B. For time: 21-15-9 wall balls and burpees over the rower, then 500m row @ {95% 500m Row /500m}', true, 'time'),
  ('TRI FIT classes', '2026-11-13', 'Sample: Snatch and grind', 'A. Snatch 6 x 2 @ {70% Snatch}
B. 4 rounds for quality: 15 kettlebell swings, 10 box jumps, 200m run', false, 'time'),
  ('HYROX', '2026-11-13', 'Sample: Race pace', '4 rounds: 1km run @ {85% 1k Run}, 1000m SkiErg @ {80% 1k Ski /500m}, 25m sled push, 20 wall balls', true, 'time'),
  ('TRI FIT classes', '2026-11-14', 'Sample: Erg intervals', 'A. 5 x 500m row @ {90% 2k Row /500m}, rest 2:00. Score is your slowest 500.
B. Partner chipper: 100 cal ski, 80 kettlebell swings, 60 box step-overs, 40 burpees', true, 'time')
) v(track, day, title, body, tracked, score_type)
join public.tf_tracks k on k.name = v.track
where not exists (select 1 from public.tf_workouts);
