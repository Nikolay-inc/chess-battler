-- Аналитика прототипа (проверка 2): события run_start, round_end, run_end.
-- Выполнить один раз: Supabase → SQL Editor → вставить файл целиком → Run.
-- Клиент пишет с публичным (publishable) ключом: RLS разрешает роли anon только вставку,
-- читать, менять и удалять события может только владелец проекта (дашборд / service role).

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  event text not null check (event in ('run_start', 'round_end', 'run_end')),
  device_id uuid not null,
  run_id text check (char_length(run_id) <= 32),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) < 4096),
  client_ts timestamptz,
  app_version text check (char_length(app_version) <= 32)
);

create index if not exists analytics_events_event_time
  on public.analytics_events (event, received_at);

alter table public.analytics_events enable row level security;

drop policy if exists "anon can insert events" on public.analytics_events;
create policy "anon can insert events" on public.analytics_events
  for insert to anon with check (true);

revoke all on public.analytics_events from anon, authenticated;
grant insert on public.analytics_events to anon;

-- Полезные запросы:
--   Сколько забегов начато и закончено по дням:
--     select date_trunc('day', received_at) d, event, count(*)
--     from analytics_events where event in ('run_start', 'run_end') group by 1, 2 order by 1;
--   Где игроки проигрывают (раунд → доля поражений):
--     select (props->>'round')::int r, avg((props->>'result' = 'loss')::int) loss_rate, count(*)
--     from analytics_events where event = 'round_end' group by 1 order by 1;
--   Медиана времени подготовки раунда:
--     select percentile_cont(0.5) within group (order by (props->>'duration_ms')::int)
--     from analytics_events where event = 'round_end';
