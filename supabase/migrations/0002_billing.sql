-- KGB Listing Video App: billing ($49 per video, or $80/month for 3 videos)
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run once on top of 0001_init.sql.

-- ---------------------------------------------------------------- profile billing fields
alter table public.profiles
  add column stripe_customer_id text unique,
  add column plan               text not null default 'none' check (plan in ('none', 'monthly')),
  add column plan_status        text,                 -- Stripe subscription status: active, past_due, canceled...
  add column credits            integer not null default 0 check (credits >= 0),
  add column credits_period_end timestamptz;          -- when this month's videos reset

-- ---------------------------------------------------------------- listing payment fields
alter table public.listings
  add column paid              boolean not null default false,
  add column paid_via          text check (paid_via in ('single', 'credit', 'comp')),
  add column stripe_session_id text;

-- ---------------------------------------------------------------- realtors can't edit billing fields
-- Only the server (service role: Stripe webhook, render worker) may change these.
create function public.guard_profile_billing() returns trigger
language plpgsql as $$
begin
  if auth.role() <> 'service_role' and (
       new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.plan is distinct from old.plan
    or new.plan_status is distinct from old.plan_status
    or new.credits is distinct from old.credits
    or new.credits_period_end is distinct from old.credits_period_end) then
    raise exception 'billing fields can only be changed by the server';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_billing_guard before update on public.profiles
  for each row execute function public.guard_profile_billing();

-- ---------------------------------------------------------------- listing status guard, now payment-aware
-- Replaces the 0001 version: a listing only starts (draft -> queued) once the server marks it paid.
create or replace function public.guard_listing_status() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'service_role' then
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

-- ---------------------------------------------------------------- spend one monthly video on a listing
-- Called by the server only. Returns true if a credit was used (or the listing was already paid).
create function public.use_credit(p_listing uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_paid boolean;
begin
  select paid into v_paid from listings where id = p_listing and user_id = p_user for update;
  if v_paid is null then
    raise exception 'listing not found';
  end if;
  if v_paid then
    return true;
  end if;
  update profiles set credits = credits - 1
   where id = p_user and credits > 0 and plan = 'monthly' and plan_status in ('active', 'trialing');
  if not found then
    return false;
  end if;
  update listings set paid = true, paid_via = 'credit', status = 'queued', error = null
   where id = p_listing;
  return true;
end $$;

revoke execute on function public.use_credit(uuid, uuid) from public, anon, authenticated;
