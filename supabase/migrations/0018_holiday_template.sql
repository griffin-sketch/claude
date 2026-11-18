-- Template 11 (Holiday). Lets listings pick it.
alter table public.listings drop constraint if exists listings_template_check;
alter table public.listings add constraint listings_template_check check (template between 1 and 11);
