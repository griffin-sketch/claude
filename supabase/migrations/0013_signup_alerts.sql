-- New-account alerts: when someone signs up, ping the site so it can notify the owner (phone push and/or email).
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run more than once.

create extension if not exists pg_net;

alter table public.profiles add column if not exists signup_notified_at timestamptz;

-- Fire-and-forget call to the site. The site re-checks the account itself, so this call carries no secret,
-- and a problem here can never stop a signup.
create or replace function public.notify_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(
      url     := 'https://www.gettourvo.com/api/hooks/signup',
      body    := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end $$;

drop trigger if exists profiles_notify_signup on public.profiles;
create trigger profiles_notify_signup after insert on public.profiles
  for each row execute function public.notify_signup();
