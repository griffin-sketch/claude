-- Per-photo effects and true vertical (9:16) clips.
alter table public.shots
  add column if not exists effect text not null default 'none'
    check (effect in ('none', 'build', 'staging', 'dusk', 'water', 'fire', 'reveal')),
  add column if not exists vclip_status text not null default 'none',
  add column if not exists vclip_path text,
  add column if not exists vfal_status_url text,
  add column if not exists vfal_response_url text;
