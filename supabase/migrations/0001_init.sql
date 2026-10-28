-- KGB Listing Video App: initial schema
-- Run in Supabase: SQL Editor -> paste -> Run (or `supabase db push`).

-- ---------------------------------------------------------------- profiles
-- One row per realtor (auth user). Branding used on every video's outro.
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  title         text,
  brokerage     text,
  phone         text,
  email         text,
  headshot_path text,          -- storage: branding/<user id>/headshot.*
  logo_path     text,          -- storage: branding/<user id>/logo.*
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- create a profile automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- listings
-- Status flow:
--   draft -> queued (realtor clicks Generate) -> generating (worker sent clips to fal.ai)
--   -> review (all clips back; realtor approves or redoes clips)
--   -> rendering (realtor clicks Make video) -> done | failed
create type public.listing_status as enum
  ('draft', 'queued', 'generating', 'review', 'rendering', 'done', 'failed');

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      public.listing_status not null default 'draft',
  address     text not null default '',
  city_line   text not null default '',          -- "Austin, TX 78704"
  headline    text not null default '',          -- optional; defaults to address on the video
  kicker      text not null default 'NOW AVAILABLE',
  beds        numeric,
  baths       numeric,
  sqft        integer,
  acres       numeric,
  price       text,
  template    smallint not null default 1 check (template between 1 and 10),
  formats     text[] not null default array['16:9', '9:16'],
  outro       text not null default 'branded' check (outro in ('branded', 'simple', 'none')),
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index listings_user_idx on public.listings (user_id, created_at desc);
create index listings_status_idx on public.listings (status);

-- ---------------------------------------------------------------- shots
-- One row per photo, in order. The worker fills clip_* as fal.ai returns clips.
create type public.clip_status as enum
  ('none', 'queued', 'generating', 'ready', 'redo', 'failed');

create table public.shots (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  position        smallint not null,
  photo_path      text not null,                 -- storage: photos/<user id>/<listing id>/<file>
  label           text not null default '',
  sub             text not null default '',
  move            text not null default 'auto',
  clip_status     public.clip_status not null default 'none',
  clip_path       text,                          -- storage: clips/<user id>/<listing id>/<shot id>-<n>.mp4
  clip_attempts   smallint not null default 0,
  fal_status_url  text,
  fal_response_url text,
  approved        boolean not null default false,
  error           text,
  created_at      timestamptz not null default now()
);
create index shots_listing_idx on public.shots (listing_id, position);
create index shots_clip_status_idx on public.shots (clip_status);

-- ---------------------------------------------------------------- renders
create table public.renders (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  format      text not null check (format in ('16:9', '9:16')),
  video_path  text not null,                     -- storage: videos/<user id>/<listing id>/<format>.mp4
  created_at  timestamptz not null default now()
);
create index renders_listing_idx on public.renders (listing_id);

-- ---------------------------------------------------------------- row level security
-- Realtors see and edit only their own rows. The render worker uses the service role key,
-- which bypasses RLS.
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.shots    enable row level security;
alter table public.renders  enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own listings" on public.listings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own shots" on public.shots
  for all using (exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));

create policy "own renders (read)" on public.renders
  for select using (exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid()));

-- Realtors may only move a listing into states they are allowed to trigger;
-- the worker (service role) does everything else.
create function public.guard_listing_status() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' or new.status = old.status then
    new.updated_at := now();
    return new;
  end if;
  if (old.status = 'draft'  and new.status = 'queued')
  or (old.status = 'review' and new.status = 'rendering')
  or (old.status = 'done'   and new.status = 'review')
  or (old.status = 'failed' and new.status in ('draft', 'queued')) then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'status change % -> % not allowed', old.status, new.status;
end $$;

create trigger listings_status_guard before update on public.listings
  for each row execute function public.guard_listing_status();

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('clips', 'clips', false),
  ('videos', 'videos', false),
  ('branding', 'branding', false)
on conflict (id) do nothing;

-- Files live under <user id>/..., and each realtor can only touch their own folder.
create policy "own files read" on storage.objects for select
  using (bucket_id in ('photos', 'clips', 'videos', 'branding')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id in ('photos', 'branding')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files update" on storage.objects for update
  using (bucket_id in ('photos', 'branding')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id in ('photos', 'branding')
         and (storage.foldername(name))[1] = auth.uid()::text);
