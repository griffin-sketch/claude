-- Per-listing Tourvo co-branding switch (owner's admin page).
-- null = automatic (on for the owner's own promo listings), true = always, false = never (e.g. a paying client).
alter table public.listings add column if not exists tourvo_branding boolean;
notify pgrst, 'reload schema';
