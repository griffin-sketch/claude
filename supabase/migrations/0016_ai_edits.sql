-- Admin AI photo edits: upload an image, describe the change, the render worker runs it on fal.ai.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run more than once.
create table if not exists public.ai_edits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  source_path  text not null,          -- in the photos bucket
  prompt       text not null,
  status       text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  result_path  text,                   -- in the photos bucket
  error        text,
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ai_edits_queue on public.ai_edits (status) where status in ('queued', 'processing');
alter table public.ai_edits enable row level security;   -- no policies: only the server (admin page) and the worker touch it
