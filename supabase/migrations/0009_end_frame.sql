-- Start & end frame: a photo's clip can travel to a second image (another listing photo or an upload).
alter table public.shots add column if not exists end_photo_path text;   -- storage: photos/<user id>/...

-- allow the new "frames" effect (the original check was created inline, so find it by its definition)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.shots'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%effect%'
  loop
    execute format('alter table public.shots drop constraint %I', c);
  end loop;
end $$;
alter table public.shots add constraint shots_effect_check
  check (effect in ('none', 'build', 'staging', 'dusk', 'water', 'fire', 'reveal', 'frames'));
