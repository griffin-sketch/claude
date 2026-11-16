-- Let the server and the Supabase SQL editor (no signed-in user) change a listing's status, so a stuck listing
-- can be fixed by hand. Customers still go through the same rules as before.
create or replace function public.guard_listing_status() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    new.updated_at := now();
    return new;
  end if;
  if new.paid is distinct from old.paid
  or new.paid_via is distinct from old.paid_via
  or new.stripe_session_id is distinct from old.stripe_session_id then
    raise exception 'payment fields can only be changed by the server';
  end if;
  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;
  if (old.status = 'review' and new.status = 'rendering')
  or (old.status = 'done'   and new.status = 'review')
  or (old.status = 'failed' and new.status = 'draft')
  or (old.status = 'failed' and new.status = 'queued' and old.paid) then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'status change % -> % not allowed', old.status, new.status;
end $$;
