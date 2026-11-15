-- Подэтап C: профили, история забегов, связь аналитики с пользователем.
-- Пользователи — Supabase Auth: гость (anonymous) по умолчанию, привязка email / Google
-- сохраняет тот же id, поэтому прогресс гостя не теряется.
-- Каждый видит и меняет только свои строки (RLS). Удаление пользователя каскадно удаляет
-- профиль и историю; аналитику удаляет Edge Function delete-account.

-- ---------- Профиль ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (nickname is null or char_length(btrim(nickname)) between 2 and 20),
  avatar text check (avatar is null or avatar ~ '^[a-z0-9-]{1,32}$'),
  locale text check (locale is null or locale in ('ru', 'uk', 'bg', 'en')),
  -- Настройки клиента (звук, музыка, скорость, вибрация) — небольшой JSON.
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile: read" on public.profiles;
create policy "own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke all on public.profiles from anon, authenticated;
grant select, update (nickname, avatar, locale, settings, updated_at) on public.profiles to authenticated;

-- Профиль создаётся вместе с пользователем (в т.ч. гостем).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- История забегов ----------

create table if not exists public.run_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id text not null check (char_length(run_id) <= 32),
  finished_at timestamptz not null default now(),
  result text not null check (result in ('won', 'lost')),
  wins smallint not null check (wins between 0 and 100),
  losses smallint not null check (losses between 0 and 100),
  rounds smallint not null check (rounds between 0 and 100),
  -- Сколько фигур каждой семьи было на поле в конце: {"legion": 3, "riders": 1}.
  families jsonb not null default '{}'::jsonb check (pg_column_size(families) < 512),
  app_version text check (char_length(app_version) <= 32),
  unique (user_id, run_id)
);
create index if not exists run_history_user_time on public.run_history (user_id, finished_at desc);

alter table public.run_history enable row level security;

drop policy if exists "own runs: read" on public.run_history;
create policy "own runs: read" on public.run_history
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "own runs: insert" on public.run_history;
create policy "own runs: insert" on public.run_history
  for insert to authenticated with check ((select auth.uid()) = user_id);

revoke all on public.run_history from anon, authenticated;
grant select, insert on public.run_history to authenticated;

-- ---------- Аналитика: связь с пользователем (для удаления аккаунта) ----------

alter table public.analytics_events add column if not exists user_id uuid;
alter table public.army_snapshots add column if not exists user_id uuid;
alter table public.run_feedback add column if not exists user_id uuid;
create index if not exists analytics_events_user on public.analytics_events (user_id);
create index if not exists army_snapshots_user on public.army_snapshots (user_id);
create index if not exists run_feedback_user on public.run_feedback (user_id);
