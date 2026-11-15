-- Подэтап D: косметика и покупки. Скины меняют только отрисовку — на бой не влияют.
-- Товары и цены на сервере — таблица products (тест в packages/content сверяет её с каталогом).
-- Покупку записывает только сервер (Edge Function после проверки платежа, ключ service role);
-- клиент свои покупки только читает. Надетые скины — profiles.equipped, триггер проверяет владение.

-- ---------- Товары ----------

create table if not exists public.products (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  kind text not null check (kind in ('board', 'frame', 'pushFx')),
  price_xtr integer not null check (price_xtr >= 0),
  active boolean not null default true
);

insert into public.products (id, kind, price_xtr) values
  ('board_default', 'board', 0),
  ('board_marble', 'board', 50),
  ('board_emerald', 'board', 50),
  ('frame_default', 'frame', 0),
  ('frame_gold', 'frame', 75),
  ('push_default', 'pushFx', 0),
  ('push_lilac', 'pushFx', 40)
on conflict (id) do update set kind = excluded.kind, price_xtr = excluded.price_xtr;

alter table public.products enable row level security;
drop policy if exists "products: read" on public.products;
create policy "products: read" on public.products for select to anon, authenticated using (true);
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;

-- ---------- Покупки ----------

create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id),
  provider text not null check (provider in ('telegram_stars', 'app_store', 'google_play', 'stripe', 'dev')),
  -- id транзакции у провайдера (telegram_payment_charge_id и т.п.): повтор не запишется дважды.
  provider_charge_id text not null check (char_length(provider_charge_id) <= 200),
  amount integer not null check (amount >= 0),
  currency text not null check (char_length(currency) <= 8),
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at timestamptz not null default now(),
  unique (provider, provider_charge_id)
);
create index if not exists purchases_user on public.purchases (user_id);

alter table public.purchases enable row level security;
drop policy if exists "own purchases: read" on public.purchases;
create policy "own purchases: read" on public.purchases
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.purchases from anon, authenticated;
grant select on public.purchases to authenticated;

-- ---------- Надетые скины ----------

alter table public.profiles add column if not exists equipped jsonb not null default '{}'::jsonb
  check (pg_column_size(equipped) < 512);
grant update (equipped) on public.profiles to authenticated;

-- Надеть можно только стандартный (цена 0) или купленный (status = paid) скин своего вида.
create or replace function public.check_equipped()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  pid text;
begin
  if new.equipped is not distinct from old.equipped then
    return new;
  end if;
  for k, pid in select key, value #>> '{}' from jsonb_each(new.equipped) loop
    if k not in ('board', 'frame', 'pushFx') then
      raise exception 'unknown cosmetic slot %', k using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.products p
      where p.id = pid and p.kind = k and (
        p.price_xtr = 0 or exists (
          select 1 from public.purchases b
          where b.user_id = new.id and b.product_id = pid and b.status = 'paid'
        )
      )
    ) then
      raise exception 'cosmetic % is not owned', pid using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_check_equipped on public.profiles;
create trigger profiles_check_equipped
  before update of equipped on public.profiles
  for each row execute function public.check_equipped();
