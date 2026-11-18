-- Holiday template (11) + "Decorate for the holidays" on listing photos.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run more than once.
alter table public.listings drop constraint if exists listings_template_check;
alter table public.listings add constraint listings_template_check check (template between 1 and 11);

-- A decorated photo replaces the shot's photo; the original is kept so it can be put back.
alter table public.shots add column if not exists original_photo_path text;
-- AI edits made for a listing photo point at it, so the worker swaps the decorated photo in.
alter table public.ai_edits add column if not exists shot_id uuid references public.shots (id) on delete cascade;
create index if not exists ai_edits_shot on public.ai_edits (shot_id);
notify pgrst, 'reload schema';
