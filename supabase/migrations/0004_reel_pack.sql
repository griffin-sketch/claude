-- Reel pack: each listing now produces several short videos.
alter table public.renders add column if not exists kind text not null default 'tour';
alter table public.listings add column if not exists open_house text;
