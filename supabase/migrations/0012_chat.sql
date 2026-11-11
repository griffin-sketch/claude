-- "Ask Tourvo" chat assistant: every message is kept so we can see what people ask. Server only (no client access).
-- Run in Supabase: SQL Editor -> paste -> Run.

create table if not exists public.chat_messages (
  id              bigserial primary key,
  conversation_id text not null,
  user_id         uuid references auth.users on delete set null,
  ip_hash         text,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  page            text,
  created_at      timestamptz not null default now()
);
create index if not exists chat_messages_conv on public.chat_messages (conversation_id, created_at);
create index if not exists chat_messages_ip on public.chat_messages (ip_hash, created_at desc);
create index if not exists chat_messages_user on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;
-- no policies: only the server (service role) reads and writes
