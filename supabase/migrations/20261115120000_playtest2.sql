-- Проверка 2 (тест с 20–30 игроками): сессии, снимки армий, опрос, представления с метриками.
-- Выполнить один раз после 20261115000000_analytics_events.sql:
-- Supabase → SQL Editor → вставить файл целиком → Run. Повторный запуск безопасен.
--
-- device_id во всех таблицах — анонимный id игрока (UUID из localStorage, без аккаунтов).
-- Клиент пишет с publishable-ключом: роли anon разрешена только вставка. Представления
-- читают с правами вызывающего (security_invoker) и закрыты от anon/authenticated —
-- смотреть их может только владелец проекта в дашборде (SQL Editor / Table Editor).

-- ---------- События: id сессии ----------

alter table public.analytics_events add column if not exists session_id uuid;
create index if not exists analytics_events_session on public.analytics_events (device_id, session_id);

-- ---------- Снимки армий (будущий пул призраков; пока не используются) ----------

create table if not exists public.army_snapshots (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  device_id uuid not null,
  session_id uuid,
  run_id text check (char_length(run_id) <= 32),
  round smallint not null check (round between 1 and 100),
  -- Победы и поражения забега на момент боя (до его итога).
  wins smallint not null check (wins between 0 and 100),
  losses smallint not null check (losses between 0 and 100),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  -- [{ "unit": "rider", "stars": 2, "x": 1, "y": 2 }, ...] — локальные координаты игрока.
  units jsonb not null check (jsonb_typeof(units) = 'array' and jsonb_array_length(units) <= 8),
  app_version text check (char_length(app_version) <= 32)
);
create index if not exists army_snapshots_round on public.army_snapshots (round, wins);

alter table public.army_snapshots enable row level security;
drop policy if exists "anon can insert snapshots" on public.army_snapshots;
create policy "anon can insert snapshots" on public.army_snapshots
  for insert to anon with check (true);
revoke all on public.army_snapshots from anon, authenticated;
grant insert on public.army_snapshots to anon;

-- ---------- Опрос в конце забега ----------

create table if not exists public.run_feedback (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  device_id uuid not null,
  session_id uuid,
  run_id text check (char_length(run_id) <= 32),
  rating smallint not null check (rating between 1 and 5),
  annoyed text check (char_length(annoyed) <= 1000),
  run_result text check (run_result in ('won', 'lost')),
  wins smallint check (wins between 0 and 100),
  rounds smallint check (rounds between 0 and 100),
  app_version text check (char_length(app_version) <= 32)
);

alter table public.run_feedback enable row level security;
drop policy if exists "anon can insert feedback" on public.run_feedback;
create policy "anon can insert feedback" on public.run_feedback
  for insert to anon with check (true);
revoke all on public.run_feedback from anon, authenticated;
grant insert on public.run_feedback to anon;

-- ---------- Представления для проверки 2 ----------
-- Сессия = session_id клиента (новая после 30 минут без событий).

-- Сессии: начало, конец, длительность, сколько забегов начато и закончено.
create or replace view public.pt2_sessions with (security_invoker = true) as
select
  device_id,
  session_id,
  min(received_at) as started_at,
  max(received_at) as ended_at,
  max(received_at) - min(received_at) as duration,
  count(*) filter (where event = 'run_start') as runs_started,
  count(*) filter (where event = 'run_end') as runs_finished,
  -- Номер сессии игрока: 1 — первая.
  row_number() over (partition by device_id order by min(received_at)) as session_no
from public.analytics_events
where session_id is not null
group by device_id, session_id;

-- Доля игроков с 3+ забегами в первой сессии (цель проверки 2).
create or replace view public.pt2_first_session_runs with (security_invoker = true) as
select
  count(*) as players,
  count(*) filter (where runs_started >= 3) as players_3plus_runs,
  round(100.0 * count(*) filter (where runs_started >= 3) / nullif(count(*), 0), 1) as share_3plus_pct,
  round(avg(runs_started), 2) as avg_runs_first_session
from public.pt2_sessions
where session_no = 1;

-- Длина сессии: средняя и медиана (сессии из одного события имеют длину 0).
create or replace view public.pt2_session_length with (security_invoker = true) as
select
  count(*) as sessions,
  avg(duration) as avg_duration,
  percentile_cont(0.5) within group (order by duration) as median_duration,
  round(avg(runs_started), 2) as avg_runs_per_session
from public.pt2_sessions;

-- Забеги: длительность (от run_start до run_end), итог, сколько раундов.
create or replace view public.pt2_runs with (security_invoker = true) as
select
  s.device_id,
  s.run_id,
  s.received_at as started_at,
  e.received_at as ended_at,
  e.received_at - s.received_at as duration,
  e.props ->> 'result' as result,
  coalesce((e.props ->> 'rounds')::int, r.max_round) as rounds,
  coalesce((e.props ->> 'wins')::int, r.wins) as wins
from public.analytics_events s
left join lateral (
  select received_at, props from public.analytics_events x
  where x.event = 'run_end' and x.device_id = s.device_id and x.run_id = s.run_id
  order by received_at limit 1
) e on true
left join lateral (
  select max((props ->> 'round')::int) as max_round,
         count(*) filter (where props ->> 'result' = 'win') as wins
  from public.analytics_events y
  where y.event = 'round_end' and y.device_id = s.device_id and y.run_id = s.run_id
) r on true
where s.event = 'run_start';

-- Длина забега: средняя и медиана по законченным, плюс сколько брошено.
create or replace view public.pt2_run_length with (security_invoker = true) as
select
  count(*) as runs_started,
  count(ended_at) as runs_finished,
  count(*) - count(ended_at) as runs_abandoned,
  avg(duration) as avg_duration,
  percentile_cont(0.5) within group (order by duration) as median_duration,
  round(avg(rounds) filter (where ended_at is not null), 2) as avg_rounds_finished
from public.pt2_runs;

-- До какого раунда доходят: для каждого раунда — сколько забегов его сыграли.
create or replace view public.pt2_round_reach with (security_invoker = true) as
with per_run as (
  select device_id, run_id, max((props ->> 'round')::int) as max_round
  from public.analytics_events
  where event = 'round_end'
  group by device_id, run_id
), total as (select count(*) as n from per_run)
select
  g.round,
  count(p.*) filter (where p.max_round >= g.round) as runs_reached,
  round(100.0 * count(p.*) filter (where p.max_round >= g.round) / nullif(max(t.n), 0), 1) as reached_pct
from generate_series(1, 20) as g(round)
cross join total t
left join per_run p on true
group by g.round
having count(p.*) filter (where p.max_round >= g.round) > 0
order by g.round;

-- Доля таймаутов: по всем боям (строка «все») и по раундам. reason приходит в round_end с 0.3.0.
create or replace view public.pt2_timeouts with (security_invoker = true) as
with b as (
  select (props ->> 'round')::int as r, props ->> 'reason' = 'timeout' as timeout
  from public.analytics_events
  where event = 'round_end' and props ? 'reason'
)
select
  case when grouping(r) = 1 then 'все' else r::text end as round,
  count(*) as battles,
  count(*) filter (where timeout) as timeouts,
  round(100.0 * count(*) filter (where timeout) / nullif(count(*), 0), 1) as timeout_pct
from b
group by grouping sets ((), (r))
order by grouping(r) desc, r;

-- Опрос: средняя оценка и распределение.
create or replace view public.pt2_feedback with (security_invoker = true) as
select
  count(*) as answers,
  round(avg(rating), 2) as avg_rating,
  count(*) filter (where rating = 5) as r5,
  count(*) filter (where rating = 4) as r4,
  count(*) filter (where rating = 3) as r3,
  count(*) filter (where rating = 2) as r2,
  count(*) filter (where rating = 1) as r1,
  count(*) filter (where coalesce(annoyed, '') <> '') as with_text
from public.run_feedback;

-- Представления — только для владельца проекта.
revoke all on public.pt2_sessions, public.pt2_first_session_runs, public.pt2_session_length,
  public.pt2_runs, public.pt2_run_length, public.pt2_round_reach, public.pt2_timeouts,
  public.pt2_feedback
  from anon, authenticated;
