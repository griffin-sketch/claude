-- Free first video, and view counts on client share links.

-- ---------------------------------------------------------------- free first video
-- Every account gets one free video (up to 8 photos, Tourvo branded). Accounts that already paid for a video
-- or a plan have had their trial.
alter table public.profiles add column if not exists trial_used boolean not null default false;
update public.profiles p set trial_used = true
 where p.plan <> 'none'
    or exists (select 1 from public.listings l where l.user_id = p.id and l.paid and l.paid_via in ('single', 'credit'));

alter table public.listings drop constraint if exists listings_paid_via_check;
alter table public.listings add constraint listings_paid_via_check check (paid_via in ('single', 'credit', 'comp', 'trial'));

create or replace function public.guard_profile_billing() returns trigger
language plpgsql as $$
begin
  if auth.role() <> 'service_role' and (
       new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.plan is distinct from old.plan
    or new.plan_status is distinct from old.plan_status
    or new.plan_interval is distinct from old.plan_interval
    or new.credits is distinct from old.credits
    or new.credits_period_end is distinct from old.credits_period_end
    or new.staging_credits is distinct from old.staging_credits
    or new.bonus_credits is distinct from old.bonus_credits
    or new.referral_code is distinct from old.referral_code
    or new.trial_used is distinct from old.trial_used) then
    raise exception 'billing fields can only be changed by the server';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Spend the account's free video on a listing. Returns false if it was already used. Server only.
create or replace function public.use_trial(p_listing uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from listings where id = p_listing and user_id = p_user and not paid for update;
  if not found then
    return false;
  end if;
  update profiles set trial_used = true where id = p_user and not trial_used;
  if not found then
    return false;
  end if;
  update listings set paid = true, paid_via = 'trial', tourvo_branding = true, status = 'queued', error = null
   where id = p_listing;
  return true;
end $$;
revoke execute on function public.use_trial(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- share link views
alter table public.listings add column if not exists share_views integer not null default 0;

-- Same rules as 0015, plus: only the server can change the view count.
create or replace function public.guard_listing_status() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    if new.share_views is distinct from old.share_views then
      return new;   -- a view isn't an edit: leave updated_at alone
    end if;
    new.updated_at := now();
    return new;
  end if;
  new.share_views := old.share_views;
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

create or replace function public.count_share_view(p_token uuid) returns void
language sql security definer set search_path = public as $$
  update listings set share_views = share_views + 1 where share_token = p_token and status = 'done';
$$;
revoke execute on function public.count_share_view(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
