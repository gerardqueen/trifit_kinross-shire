-- ============================================================
-- TRI FIT Kinross-shire: profile photos and the coaches' class register.
-- Run after 003_benchmarks.sql. Safe to run more than once.
-- In the Supabase editor choose "Run without RLS" if it asks.
-- ============================================================

-- ---------- Profile photos ----------
-- Each person can upload one photo into tf-photos/avatars/<their user id>/ and nowhere else.
alter table public.tf_profiles add column if not exists avatar_url text;

drop policy if exists "tf photos own avatar write" on storage.objects;
create policy "tf photos own avatar write" on storage.objects for insert to authenticated
  with check (bucket_id = 'tf-photos' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "tf photos own avatar update" on storage.objects;
create policy "tf photos own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'tf-photos' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "tf photos own avatar delete" on storage.objects;
create policy "tf photos own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tf-photos' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- Only a photo from the person's own folder can be set (or null to remove it).
create or replace function public.tf_set_avatar(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_url is not null and position('/tf-photos/avatars/' || auth.uid()::text || '/' in p_url) = 0 then
    raise exception 'That photo is not in your folder';
  end if;
  update public.tf_profiles set avatar_url = p_url where user_id = auth.uid();
end $$;

-- tf_me now also returns the photo. Its result columns change, so it is dropped and made again.
drop function if exists public.tf_me(text);
create function public.tf_me(p_name text default null)
returns table (user_id uuid, email text, name text, role text, status text, board_default boolean,
               teamup_plan text, teamup_status text, teamup_checked_at timestamptz, is_admin boolean, avatar_url text)
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
    p.teamup_plan, p.teamup_status, p.teamup_checked_at, adm, p.avatar_url
  from public.tf_profiles p where p.user_id = me;
end $$;

-- ---------- Register ----------
-- One row per person per class, marked by a coach. class_key is the website class id for
-- preview bookings, or 'e' + the TeamUp event id once TeamUp is linked. member_key is the
-- person's user id, or 'tu:' + their TeamUp customer id if they have no account here.
create table if not exists public.tf_attendance (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  class_key   text not null check (char_length(class_key) <= 80),
  member_key  text not null check (char_length(member_key) <= 80),
  member_name text check (char_length(member_name) <= 120),
  status      text not null check (status in ('present','absent')),
  marked_by   uuid default auth.uid(),
  marked_at   timestamptz not null default now(),
  unique (day, class_key, member_key)
);
alter table public.tf_attendance enable row level security;
drop policy if exists "tf_attendance staff" on public.tf_attendance;
create policy "tf_attendance staff" on public.tf_attendance for all using (public.tf_is_staff()) with check (public.tf_is_staff());
revoke all on public.tf_attendance from anon;
grant select, insert, update, delete on public.tf_attendance to authenticated;

-- Who is booked into one website class on one day (preview bookings, before TeamUp is linked),
-- with their photo and any mark already made. Coaches and admins only.
create or replace function public.tf_register(p_class uuid, p_day date)
returns table (member_key text, name text, email text, avatar_url text, status text)
language sql stable security definer set search_path = public as $$
  select b.user_id::text, coalesce(p.name, p.email, 'Member'), p.email, p.avatar_url, a.status
  from public.tf_bookings b
  left join public.tf_profiles p on p.user_id = b.user_id
  left join public.tf_attendance a on a.day = p_day and a.class_key = p_class::text and a.member_key = b.user_id::text
  where public.tf_is_staff() and b.class_id = p_class and b.day = p_day and b.status <> 'failed'
  order by 2;
$$;

-- How many are booked into each website class on one day, for the class list on the Register tab.
create or replace function public.tf_register_counts(p_day date)
returns table (class_id uuid, booked integer, present integer)
language sql stable security definer set search_path = public as $$
  select b.class_id, count(*)::int,
    count(*) filter (where exists (select 1 from public.tf_attendance a where a.day = p_day and a.class_key = b.class_id::text and a.member_key = b.user_id::text and a.status = 'present'))::int
  from public.tf_bookings b
  where public.tf_is_staff() and b.day = p_day and b.status <> 'failed'
  group by b.class_id;
$$;

revoke execute on function public.tf_set_avatar(text), public.tf_me(text), public.tf_register(uuid, date), public.tf_register_counts(date) from public, anon;
grant execute on function public.tf_set_avatar(text), public.tf_me(text), public.tf_register(uuid, date), public.tf_register_counts(date) to authenticated;
