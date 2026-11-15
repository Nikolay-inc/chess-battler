// Удаление аккаунта со всеми данными (подэтап C).
// Вызывает сам пользователь (его JWT в Authorization). Сервер с ключом service role:
// удаляет аналитику пользователя, затем пользователя Auth — профиль, история забегов
// (и позже покупки) удаляются каскадом (on delete cascade).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const ANALYTICS_TABLES = ['analytics_events', 'army_snapshots', 'run_feedback'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  const uid = data.user.id;

  for (const table of ANALYTICS_TABLES) {
    const { error: e } = await admin.from(table).delete().eq('user_id', uid);
    if (e) return json({ error: `cleanup_failed:${table}` }, 500);
  }
  const { error: delError } = await admin.auth.admin.deleteUser(uid);
  if (delError) return json({ error: 'delete_failed' }, 500);

  return json({ ok: true });
});
