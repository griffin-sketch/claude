-- Subscriptions (Starter / Growth, billed monthly, quarterly or yearly) and referrals.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run once on top of 0009.

-- ---------------------------------------------------------------- plans
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('none', 'monthly', 'starter', 'growth'));

alter table public.profiles
  add column if not exists plan_interval   text check (plan_interval in ('month', 'quarter', 'year')),
  add column if not exists staging_credits integer not null default 0 check (staging_credits >= 0), -- staged photos left this term
  add column if not exists bonus_credits   integer not null default 0 check (bonus_credits >= 0),   -- free videos from referrals; never expire
  add column if not exists referral_code   text unique;

-- ---------------------------------------------------------------- referral codes
create or replace function public.new_referral_code() returns text
language plpgsql as $$
declare
  c text;
begin
  loop
    -- 7 letters/digits without look-alikes (0/O, 1/I/L)
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
      into c from generate_series(1, 7);
    exit when not exists (select 1 from public.profiles where referral_code = c);
  end loop;
  return c;
end $$;

update public.profiles set referral_code = public.new_referral_code() where referral_code is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, referral_code) values (new.id, new.email, public.new_referral_code());
  return new;
end $$;

-- ---------------------------------------------------------------- who referred whom
create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references auth.users on delete cascade,
  referred_id  uuid not null unique references auth.users on delete cascade, -- a person can be referred once
  status       text not null default 'joined' check (status in ('joined', 'rewarded')),
  created_at   timestamptz not null default now(),
  rewarded_at  timestamptz,
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;
-- Referrers see their own referrals (no names or emails are stored here). Only the server writes.
drop policy if exists "own referrals read" on public.referrals;
create policy "own referrals read" on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- ---------------------------------------------------------------- billing fields stay server-only
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
    or new.referral_code is distinct from old.referral_code) then
    raise exception 'billing fields can only be changed by the server';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- spend one video on a listing
-- Plan videos first (they refill each term), then free referral videos. Server only.
create or replace function public.use_credit(p_listing uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_paid boolean;
  v_via  text;
begin
  select paid into v_paid from listings where id = p_listing and user_id = p_user for update;
  if v_paid is null then
    raise exception 'listing not found';
  end if;
  if v_paid then
    return true;
  end if;
  update profiles set credits = credits - 1
   where id = p_user and credits > 0 and plan <> 'none' and plan_status in ('active', 'trialing');
  if found then
    v_via := 'credit';
  else
    update profiles set bonus_credits = bonus_credits - 1 where id = p_user and bonus_credits > 0;
    if not found then
      return false;
    end if;
    v_via := 'credit';
  end if;
  update listings set paid = true, paid_via = v_via, status = 'queued', error = null where id = p_listing;
  return true;
end $$;
revoke execute on function public.use_credit(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- unlock staged photos with the plan's included photos
-- Unlocks as many of p_ids as the plan covers; returns the ids it unlocked. Server only.
create or replace function public.use_staging_credits(p_user uuid, p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_left int;
  v_ids  uuid[];
begin
  select staging_credits into v_left from profiles
   where id = p_user and plan <> 'none' and plan_status in ('active', 'trialing') for update;
  if coalesce(v_left, 0) < 1 then
    return '{}';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from stagings
     where user_id = p_user and id = any(p_ids) and not paid and status = 'ready'
     order by created_at limit v_left
  ) t;
  if cardinality(v_ids) = 0 then
    return '{}';
  end if;
  update stagings set paid = true, paid_via = 'plan' where id = any(v_ids);
  update profiles set staging_credits = staging_credits - cardinality(v_ids) where id = p_user;
  return v_ids;
end $$;
revoke execute on function public.use_staging_credits(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- reward a referral once the friend pays for a plan
-- Both people get one free video. Runs once per referred person. Returns true if it rewarded now. Server only.
create or replace function public.reward_referral(p_referred uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid;
begin
  update referrals set status = 'rewarded', rewarded_at = now()
   where referred_id = p_referred and status = 'joined'
   returning referrer_id into v_referrer;
  if v_referrer is null then
    return false;
  end if;
  update profiles set bonus_credits = bonus_credits + 1 where id in (v_referrer, p_referred);
  return true;
end $$;
revoke execute on function public.reward_referral(uuid) from public, anon, authenticated;
