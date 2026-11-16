-- Photo framing and per-video photo picks.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run more than once.

-- The part of each photo the tall Reels (9:16) videos show: {"x","y","w","h"} as fractions (0-1) of the photo,
-- a 9:16 frame. Empty = centered, as before. The wide videos always use the whole photo.
alter table public.shots add column if not exists crop jsonb;

-- Which photos each short video uses, in order: {"teaser": [shot ids], "just_listed": [...], ...}.
-- A video missing from here picks its photos automatically (as before).
alter table public.listings add column if not exists reel_shots jsonb not null default '{}'::jsonb;

-- A new Reel crop on a photo that already has its vertical clip remakes just that clip ("vclip_status" -> 'redo').
-- It counts toward the listing's 5 redos, the same as remaking a clip.
create or replace function public.guard_shot_redo() returns trigger
language plpgsql as $$
declare
  v_used int;
  v_counts boolean := false;
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then -- the worker, or the SQL editor
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_redos := 0;
    return new;
  end if;
  if new.user_redos is distinct from old.user_redos then
    raise exception 'redo count is set by the server';
  end if;
  if new.clip_status is distinct from old.clip_status then
    if new.clip_status <> 'redo' then
      raise exception 'clip status % -> % not allowed', old.clip_status, new.clip_status;
    end if;
    v_counts := old.clip_status <> 'failed'; -- remaking a failed clip is on us
  end if;
  if new.vclip_status is distinct from old.vclip_status then
    if new.vclip_status <> 'redo' then
      raise exception 'vertical clip status % -> % not allowed', old.vclip_status, new.vclip_status;
    end if;
    if old.vclip_status is null or old.vclip_status in ('none', 'redo') then
      raise exception 'no vertical clip to remake';
    end if;
    v_counts := v_counts or old.vclip_status <> 'failed';
  end if;
  if v_counts then
    perform 1 from public.listings where id = new.listing_id for update; -- one redo at a time per listing
    select coalesce(sum(user_redos), 0) into v_used from public.shots where listing_id = new.listing_id;
    if v_used >= 5 then
      raise exception 'You''ve used all 5 redos for this listing.';
    end if;
    new.user_redos := old.user_redos + 1;
  end if;
  return new;
end $$;
