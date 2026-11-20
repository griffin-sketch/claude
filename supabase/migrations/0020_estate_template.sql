-- Template 12 · Estate (a realtor's brand look: Cormorant Garamond + Montserrat).
alter table public.listings drop constraint if exists listings_template_check;
alter table public.listings add constraint listings_template_check check (template between 1 and 12);
notify pgrst, 'reload schema';

-- Per listing: no Tourvo branding, and the realtor's own logo in the corner instead (set on the admin page).
alter table public.listings add column if not exists agent_bug boolean not null default false;
notify pgrst, 'reload schema';
