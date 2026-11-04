-- Photographer accounts, client-branded videos, delivery links and text hooks.
alter table public.profiles
  add column if not exists account_type text not null default 'agent' check (account_type in ('agent', 'photographer')),
  add column if not exists company text;

alter table public.listings
  add column if not exists hook text,
  add column if not exists client_name text,
  add column if not exists client_brokerage text,
  add column if not exists client_phone text,
  add column if not exists client_logo_path text,
  add column if not exists client_headshot_path text,
  add column if not exists share_token uuid unique;

alter table public.listings drop constraint if exists listings_outro_check;
alter table public.listings add constraint listings_outro_check check (outro in ('branded', 'client', 'simple', 'none'));
