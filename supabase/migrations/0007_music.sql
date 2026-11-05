-- Background music: a library track id, 'custom' (the customer's upload at music_path) or 'none'.
alter table public.listings
  add column if not exists music text not null default 'none',
  add column if not exists music_path text;
