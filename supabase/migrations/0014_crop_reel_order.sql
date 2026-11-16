-- Photo framing and per-video photo picks.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run more than once.

-- The part of each photo the video shows: {"x","y","w","h"} as fractions (0-1) of the photo, a 16:9 frame.
-- Empty = use the whole photo (as before).
alter table public.shots add column if not exists crop jsonb;

-- Which photos each short video uses, in order: {"teaser": [shot ids], "just_listed": [...], ...}.
-- A video missing from here picks its photos automatically (as before).
alter table public.listings add column if not exists reel_shots jsonb not null default '{}'::jsonb;
