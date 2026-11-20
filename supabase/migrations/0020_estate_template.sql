-- Template 12 · Estate (a realtor's brand look: Cormorant Garamond + Montserrat).
alter table public.listings drop constraint if exists listings_template_check;
alter table public.listings add constraint listings_template_check check (template between 1 and 12);
notify pgrst, 'reload schema';
