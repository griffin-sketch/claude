-- Virtual staging: furniture style + room for the video effect, and staged still photos ($5 each).

-- 1. The staging video effect gets a furniture style and a room type.
alter table public.shots add column if not exists stage_style text not null default 'modern';
alter table public.shots add column if not exists stage_room  text not null default 'auto';

-- 2. Staged photos. Previews are free and watermarked; the clean full-size photo is unlocked by paying.
create table if not exists public.stagings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  listing_id        uuid references public.listings on delete set null,
  source_path       text not null,                 -- storage: photos/<user id>/staging/<file>
  room              text not null default 'auto',
  style             text not null default 'modern',
  status            text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  preview_path      text,                          -- storage: staged/<user id>/<id>-<n>.jpg   (watermarked, owner can read)
  result_path       text,                          -- storage: staged-full/<user id>/<id>-<n>.jpg (server only, unlocked when paid)
  paid              boolean not null default false,
  paid_via          text,
  stripe_session_id text,
  attempts          int not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists stagings_user on public.stagings (user_id, created_at desc);
create index if not exists stagings_queue on public.stagings (status) where status in ('queued', 'processing');

alter table public.stagings enable row level security;
create policy "own stagings read"   on public.stagings for select using (auth.uid() = user_id);
create policy "own stagings insert" on public.stagings for insert
  with check (auth.uid() = user_id and not paid and status = 'queued' and result_path is null and preview_path is null);
create policy "own stagings update" on public.stagings for update using (auth.uid() = user_id);
create policy "own stagings delete" on public.stagings for delete using (auth.uid() = user_id and not paid);

-- Customers may change room/style and ask for a new take (back to 'queued') on an unpaid photo; everything else
-- (payment, results, status otherwise) is set by the server.
create or replace function public.guard_staging() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if auth.role() = 'service_role' then return new; end if;
  if new.user_id <> old.user_id or new.source_path <> old.source_path or new.paid <> old.paid
     or new.paid_via is distinct from old.paid_via or new.stripe_session_id is distinct from old.stripe_session_id
     or new.preview_path is distinct from old.preview_path or new.result_path is distinct from old.result_path
     or new.attempts <> old.attempts or new.listing_id is distinct from old.listing_id then
    raise exception 'not allowed';
  end if;
  if new.status <> old.status and not (new.status = 'queued' and old.status in ('ready', 'failed') and not old.paid) then
    raise exception 'status change % -> % not allowed', old.status, new.status;
  end if;
  if old.paid and (new.room <> old.room or new.style <> old.style) then
    raise exception 'this photo is already paid for';
  end if;
  return new;
end $$;
drop trigger if exists stagings_guard on public.stagings;
create trigger stagings_guard before update on public.stagings for each row execute function public.guard_staging();

-- 3. Storage: watermarked previews the owner can see; full-size results only the server can read.
insert into storage.buckets (id, name, public) values ('staged', 'staged', false), ('staged-full', 'staged-full', false)
  on conflict (id) do nothing;
create policy "own staged previews read" on storage.objects for select
  using (bucket_id = 'staged' and (storage.foldername(name))[1] = auth.uid()::text);
