-- Template 13 · Sunshine Coast (Florida / beach: sand cards, sunset stripes, Pacifico script).
alter table public.listings drop constraint if exists listings_template_check;
alter table public.listings add constraint listings_template_check check (template between 1 and 13);
notify pgrst, 'reload schema';
