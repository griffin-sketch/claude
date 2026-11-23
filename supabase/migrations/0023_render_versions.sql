-- Keep every build of a listing's videos (V1, V2, ...) instead of replacing them when the realtor makes changes.
alter table public.renders add column if not exists version integer not null default 1;
create index if not exists renders_listing_version_idx on public.renders (listing_id, version);
notify pgrst, 'reload schema';
