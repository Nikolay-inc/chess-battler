-- Подэтап E: вход через Telegram Mini App. Привязка Telegram id → пользователь Supabase.
-- Пишет и читает только сервер (Edge Function telegram-auth, ключ service role).
create table if not exists public.telegram_accounts (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_accounts from anon, authenticated;
