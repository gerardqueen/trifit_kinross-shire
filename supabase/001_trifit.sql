-- ============================================================
-- TRI FIT Kinross-shire website: content, enquiries, photos, admins
-- Self-contained: everything is prefixed tf_ / tf-, and admin access is its own list
-- (tf_admins), so this can live in a shared Supabase project without TRI FIT admins seeing
-- any other site's data (or the other way round). Works the same in a project of its own.
-- Supabase → SQL Editor → New query → paste → Run. Safe to run more than once.
-- ============================================================

-- ---------- Admins ----------
create table if not exists public.tf_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
-- Someone who created an account but isn't an admin yet (shows on the Admins tab).
create table if not exists public.tf_access_requests (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
-- Emails an admin has added in advance. When that person creates an account and confirms
-- the email, they become an admin straight away.
create table if not exists public.tf_admin_invites (
  email      text primary key check (email = lower(email) and char_length(email) between 3 and 320),
  created_at timestamptz not null default now()
);

create or replace function public.tf_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tf_admins where user_id = auth.uid());
$$;

-- Called when a signed-in non-admin opens the admin page: invited (and confirmed) emails
-- become admins, everyone else is listed as asking for access.
create or replace function public.tf_request_access() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text;
  confirmed timestamptz;
begin
  if me is null or public.tf_is_admin() then return; end if;
  select lower(email), email_confirmed_at into my_email, confirmed from auth.users where id = me;
  if confirmed is not null and exists (select 1 from public.tf_admin_invites where email = my_email) then
    insert into public.tf_admins (user_id, email) values (me, my_email) on conflict (user_id) do nothing;
    delete from public.tf_admin_invites where email = my_email;
    delete from public.tf_access_requests where user_id = me;
  else
    insert into public.tf_access_requests (user_id, email) values (me, my_email) on conflict (user_id) do nothing;
  end if;
end $$;

create or replace function public.tf_approve_admin(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tf_is_admin() then raise exception 'Only admins can approve admins'; end if;
  insert into public.tf_admins (user_id, email)
  select id, email from auth.users where id = target
  on conflict (user_id) do nothing;
  delete from public.tf_access_requests where user_id = target;
end $$;

create or replace function public.tf_remove_admin(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tf_is_admin() then raise exception 'Only admins can remove admins'; end if;
  if target = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  delete from public.tf_admins where user_id = target;
end $$;

create or replace function public.tf_list_admins() returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select a.user_id, coalesce(a.email, u.email::text) from public.tf_admins a
  left join auth.users u on u.id = a.user_id
  where public.tf_is_admin() order by a.created_at;
$$;

-- ---------- Content ----------
-- Site details (headline, contact email, links, section text) as one JSON value.
create table if not exists public.tf_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.tf_coaches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  role       text check (char_length(role) <= 60),
  blurb      text check (char_length(blurb) <= 500),
  photo_url  text,
  published  boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.tf_classes (
  id         uuid primary key default gen_random_uuid(),
  day        smallint not null check (day between 1 and 7),          -- 1 = Monday
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration   integer not null default 60,
  name       text not null check (char_length(name) between 1 and 60),
  coach      text check (char_length(coach) <= 120),
  note       text check (char_length(note) <= 40),
  created_at timestamptz not null default now()
);
create table if not exists public.tf_memberships (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  price       text not null check (char_length(price) <= 20),
  period      text check (char_length(period) <= 30),
  description text check (char_length(description) <= 300),
  highlight   boolean not null default false,
  published   boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.tf_programming (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('pillar','week','principle')),
  label      text check (char_length(label) <= 12),
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) <= 700),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Enquiries from the website form ----------
create table if not exists public.tf_enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  email       text not null check (char_length(email) between 3 and 320),
  phone       text check (char_length(phone) <= 40),
  interest    text check (char_length(interest) <= 100),
  message     text check (char_length(message) <= 4000),
  page        text check (char_length(page) <= 200),
  handled     boolean not null default false,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.tf_admins          enable row level security;
alter table public.tf_access_requests enable row level security;
alter table public.tf_admin_invites   enable row level security;
alter table public.tf_content         enable row level security;
alter table public.tf_coaches         enable row level security;
alter table public.tf_classes         enable row level security;
alter table public.tf_memberships     enable row level security;
alter table public.tf_programming     enable row level security;
alter table public.tf_enquiries       enable row level security;

drop policy if exists "tf_admins admin read" on public.tf_admins;
create policy "tf_admins admin read" on public.tf_admins for select using (public.tf_is_admin());
drop policy if exists "tf_requests admin manage" on public.tf_access_requests;
create policy "tf_requests admin manage" on public.tf_access_requests
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());
drop policy if exists "tf_invites admin manage" on public.tf_admin_invites;
create policy "tf_invites admin manage" on public.tf_admin_invites
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

-- Website content: anyone can read what is published; only admins can change it.
drop policy if exists "tf_content public read" on public.tf_content;
create policy "tf_content public read" on public.tf_content for select using (true);
drop policy if exists "tf_content admin write" on public.tf_content;
create policy "tf_content admin write" on public.tf_content
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_coaches public read" on public.tf_coaches;
create policy "tf_coaches public read" on public.tf_coaches for select using (published or public.tf_is_admin());
drop policy if exists "tf_coaches admin write" on public.tf_coaches;
create policy "tf_coaches admin write" on public.tf_coaches
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_classes public read" on public.tf_classes;
create policy "tf_classes public read" on public.tf_classes for select using (true);
drop policy if exists "tf_classes admin write" on public.tf_classes;
create policy "tf_classes admin write" on public.tf_classes
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_memberships public read" on public.tf_memberships;
create policy "tf_memberships public read" on public.tf_memberships for select using (published or public.tf_is_admin());
drop policy if exists "tf_memberships admin write" on public.tf_memberships;
create policy "tf_memberships admin write" on public.tf_memberships
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

drop policy if exists "tf_programming public read" on public.tf_programming;
create policy "tf_programming public read" on public.tf_programming for select using (true);
drop policy if exists "tf_programming admin write" on public.tf_programming;
create policy "tf_programming admin write" on public.tf_programming
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

-- Anyone can send an enquiry, but only a new, unhandled one; only admins can read them.
drop policy if exists "tf_enquiries public insert" on public.tf_enquiries;
create policy "tf_enquiries public insert" on public.tf_enquiries
  for insert with check (handled = false and notified_at is null);
drop policy if exists "tf_enquiries admin manage" on public.tf_enquiries;
create policy "tf_enquiries admin manage" on public.tf_enquiries
  for all using (public.tf_is_admin()) with check (public.tf_is_admin());

grant select on public.tf_content, public.tf_coaches, public.tf_classes, public.tf_memberships, public.tf_programming to anon, authenticated;
grant insert on public.tf_enquiries to anon, authenticated;
grant all on public.tf_content, public.tf_coaches, public.tf_classes, public.tf_memberships, public.tf_programming,
  public.tf_enquiries, public.tf_access_requests, public.tf_admin_invites to authenticated;
grant select on public.tf_admins to authenticated;
revoke execute on function public.tf_request_access(), public.tf_approve_admin(uuid), public.tf_remove_admin(uuid), public.tf_list_admins() from public, anon;
grant execute on function public.tf_is_admin(), public.tf_request_access(), public.tf_approve_admin(uuid),
  public.tf_remove_admin(uuid), public.tf_list_admins() to authenticated;
grant execute on function public.tf_is_admin() to anon;

-- ---------- Storage ----------
-- Coach and site photos: public read (they're on the website), admins upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tf-photos', 'tf-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "tf photos public read" on storage.objects;
create policy "tf photos public read" on storage.objects
  for select using (bucket_id = 'tf-photos');
drop policy if exists "tf photos admin write" on storage.objects;
create policy "tf photos admin write" on storage.objects
  for insert with check (bucket_id = 'tf-photos' and public.tf_is_admin());
drop policy if exists "tf photos admin update" on storage.objects;
create policy "tf photos admin update" on storage.objects
  for update using (bucket_id = 'tf-photos' and public.tf_is_admin());
drop policy if exists "tf photos admin delete" on storage.objects;
create policy "tf photos admin delete" on storage.objects
  for delete using (bucket_id = 'tf-photos' and public.tf_is_admin());

-- ---------- Starting content ----------
-- Loaded once, only into empty tables, so running this file again never overwrites edits.
-- Generated from js/defaults.js with: node tools/seed.mjs
insert into public.tf_content (key, value) values ('settings', '{"name":"TRI FIT Kinross-shire","hero_eyebrow":"Functional fitness in Kinross","hero_headline":"Strength. Movement. Conditioning.","hero_text":"A friendly, community driven gym with coached classes for every level. Official HYROX affiliate. Group classes, 1:1 and small group personal training.","hero_image":"","schedule_note":"Kids classes, HYROX academy, fundamentals courses and yoga also run at set times. See TeamUp for current dates.","membership_note":"Memberships are bought and managed through TeamUp. Not sure which one fits? Send us an enquiry.","programming_heading":"Three sides, one plan","programming_intro":"Tri Fit is built on three things: strength, conditioning and movement. Each has its own session in the week, and our functional fitness classes bring them together. No class is random. Every session has a purpose, and the week is planned as a whole.","contact_email":"jt.trifit@gmail.com","phone":"07773 704493","location":"Kinross, Scotland","instagram":"https://www.instagram.com/tri.fitkinrossshire/","facebook":"https://www.facebook.com/profile.php?id=100076319800931","teamup":"https://goteamup.com/p/4996174-tri-fit-kinross-shire/"}'::jsonb)
on conflict (key) do nothing;

insert into public.tf_coaches (name, role, blurb, photo_url, published, sort)
select * from (values
  ('John Henderson', 'Coach', '', '', true, 1),
  ('Jennifer Wallace', 'Coach', '', '', true, 2),
  ('Mark Wallace', 'Coach', '', '', true, 3),
  ('Beth Farmer', 'Coach', '', '', true, 4),
  ('Scott Allardice', 'Coach', '', '', true, 5),
  ('Emma Armstrong', 'Coach', '', '', true, 6),
  ('Karen Young', 'Coach', '', '', true, 7),
  ('Jordan Leslie', 'Coach', '', '', true, 8),
  ('Kirsty Gallagher', 'Coach', '', '', true, 9)
) v
where not exists (select 1 from public.tf_coaches);

insert into public.tf_classes (day, start_time, duration, name, coach, note)
select * from (values
  (1, '06:00', 60, 'TRI FIT strength', 'Beth Farmer', ''),
  (1, '07:00', 60, 'TRI FIT strength', 'Beth Farmer', ''),
  (1, '17:30', 60, 'TRI FIT strength', 'Mark Wallace, Jordan Leslie', ''),
  (1, '18:30', 60, 'TRI FIT strength', 'Mark Wallace, Jordan Leslie', ''),
  (2, '06:00', 60, 'TRI FIT FF', 'John Henderson', ''),
  (2, '07:00', 60, 'TRI FIT FF', 'John Henderson', ''),
  (2, '17:30', 60, 'TRI FIT FF', 'Jennifer Wallace', ''),
  (2, '18:30', 60, 'HYROX', 'Jennifer Wallace', 'Ages 16+'),
  (3, '06:00', 60, 'TRI FIT movement', 'Scott Allardice', ''),
  (3, '07:00', 60, 'TRI FIT movement', 'Scott Allardice', ''),
  (3, '12:30', 60, 'TRI FIT movement', 'John Henderson', ''),
  (3, '17:30', 60, 'TRI FIT movement', 'Emma Armstrong', ''),
  (3, '18:30', 60, 'TRI FIT movement', 'Emma Armstrong', ''),
  (4, '06:00', 60, 'TRI FIT FF', 'John Henderson', ''),
  (4, '07:00', 60, 'TRI FIT FF', 'John Henderson', ''),
  (4, '17:30', 60, 'TRI FIT FF', 'Karen Young', ''),
  (4, '18:30', 60, 'TRI FIT FF', 'Karen Young', ''),
  (5, '06:00', 60, 'TRI FIT FF', 'Jennifer Wallace', ''),
  (5, '07:00', 60, 'TRI FIT FF', 'Jennifer Wallace', ''),
  (5, '16:00', 60, 'TRI FIT FF', 'John Henderson', ''),
  (5, '18:00', 60, 'HYROX', 'John Henderson', 'Ages 16+'),
  (6, '07:30', 60, 'TRI FIT conditioning', 'Mark Wallace, Karen Young', '')
) v
where not exists (select 1 from public.tf_classes);

insert into public.tf_memberships (name, price, period, description, highlight, published, sort)
select * from (values
  ('Unlimited', '£65', 'per month', 'Access to every class on the timetable.', true, true, 1),
  ('Teen', '£45', 'per month', 'For ages 16 to 18 in full-time education.', false, true, 2),
  ('HYROX Kids', '£28', 'per month', 'The weekly HYROX kids class.', false, true, 3),
  ('Tri Fit Kids', '£28', 'class pass', 'Kids class pass. Starts on your first booking.', false, true, 4),
  ('1:1 and small group PT', 'Ask us', '', 'Personal and small group coaching. Enquire for availability and prices.', false, true, 5)
) v
where not exists (select 1 from public.tf_memberships);

insert into public.tf_programming (kind, label, title, body, sort)
select * from (values
  ('pillar', '01', 'Strength', 'Barbell and dumbbell lifts, built up in small steps from week to week. Getting stronger makes everything else easier, from carrying the shopping to race day, and it protects your joints as you age. Loads are set for you, so a first-timer and a ten-year lifter can train side by side.', 1),
  ('pillar', '02', 'Conditioning', 'Rowers, ski ergs, running and bodyweight work at planned intensities. Some days are long and steady and some are short and hard, because your heart and lungs need both. You leave fitter without being flattened.', 2),
  ('pillar', '03', 'Movement', 'Mobility, gymnastics skills and technique at a slower pace. Moving well is what lets you lift and breathe hard without picking up niggles, so it gets a session of its own instead of five rushed minutes at the end.', 3),
  ('week', 'Mon', 'Strength', 'The heaviest lifting comes first, while you are fresh from the weekend.', 4),
  ('week', 'Tue', 'Functional fitness and HYROX', 'A strength or skill piece, then a workout that mixes lifting, gymnastics and cardio. HYROX runs in the evening.', 5),
  ('week', 'Wed', 'Movement', 'A lower intensity day in the middle of the week, so you can train five or six days without running yourself into the ground.', 6),
  ('week', 'Thu', 'Functional fitness', 'Back to mixed work, with different lifts and time frames from Tuesday.', 7),
  ('week', 'Fri', 'Functional fitness and HYROX', 'A last mixed session, plus race practice: running, sleds, ski, row, carries and wall balls.', 8),
  ('week', 'Sat', 'Conditioning', 'One longer engine session to finish the week. Sunday is for rest.', 9),
  ('principle', '', 'Planned, not random', 'Sessions are written in advance so that loads and skills build on the week before. You always know why you are doing what is on the board.', 10),
  ('principle', '', 'Scaled for everyone', 'Every workout has options. The aim is the same effort for each person, whatever the weight on the bar.', 11),
  ('principle', '', 'Coached, every class', 'Classes are capped at 12 to 18 people, so your coach can watch every lift and adjust on the spot.', 12)
) v
where not exists (select 1 from public.tf_programming);

-- ---------- First admin ----------
-- Put your email below (lower case), un-comment the line and run it once. Then open
-- /admin.html, choose "New admin? Create an account" with that email (or just sign in, if you
-- already have a login from another site in this Supabase project) and you are in.
-- After that, add everyone else from the Admins tab.
-- insert into public.tf_admin_invites (email) values ('you@example.com') on conflict do nothing;
