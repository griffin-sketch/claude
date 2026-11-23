-- Where the realtor plans to post. "mls" also makes an unbranded MLS version, served from its own address
-- (mls.gettourvo.com/<mls_token>) as MLSs like NTREIS require.
alter table public.listings add column if not exists post_to text[] not null default '{}';
alter table public.listings add column if not exists mls_token uuid not null default gen_random_uuid();
create unique index if not exists listings_mls_token_idx on public.listings (mls_token);
notify pgrst, 'reload schema';
