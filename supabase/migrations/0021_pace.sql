-- Pace: the usual walkthrough, or fast cuts timed to the music's beat.
alter table public.listings add column if not exists pace text not null default 'normal' check (pace in ('normal', 'fast'));
notify pgrst, 'reload schema';
