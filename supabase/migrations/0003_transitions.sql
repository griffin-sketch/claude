-- Transition style between shots.
alter table public.listings
  add column if not exists transition text not null default 'crossfade'
  check (transition in ('crossfade', 'speed_ramp', 'flash', 'cut'));
