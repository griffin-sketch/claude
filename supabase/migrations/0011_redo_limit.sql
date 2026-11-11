-- Clip redos: only when the customer asks, at most 5 per listing (a failed clip doesn't count).
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run once on top of 0010.

alter table public.shots add column if not exists user_redos integer not null default 0 check (user_redos >= 0);

create or replace function public.guard_shot_redo() returns trigger
language plpgsql as $$
declare
  v_used int;
begin
  if auth.role() = 'service_role' then
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
    if old.clip_status = 'failed' then
      return new; -- remaking a failed clip is on us
    end if;
    select coalesce(sum(user_redos), 0) into v_used from public.shots where listing_id = new.listing_id for update;
    if v_used >= 5 then
      raise exception 'You''ve used all 5 redos for this listing.';
    end if;
    new.user_redos := old.user_redos + 1;
  end if;
  return new;
end $$;

drop trigger if exists shots_redo_guard on public.shots;
create trigger shots_redo_guard before insert or update on public.shots
  for each row execute function public.guard_shot_redo();
