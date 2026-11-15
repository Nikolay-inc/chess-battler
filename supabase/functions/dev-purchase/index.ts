// Тестовая «оплата» для локальной разработки (подэтап D): записывает покупку так же,
// как это сделает вебхук Telegram Stars, но без денег. Работает ТОЛЬКО при
// ALLOW_DEV_PURCHASES=1 — этот секрет задан лишь в локальном supabase/config.toml
// ([edge_runtime.secrets]); в облаке его нет, функция отвечает 403.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (Deno.env.get('ALLOW_DEV_PURCHASES') !== '1') return json({ error: 'disabled' }, 403);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);

  const { productId } = (await req.json().catch(() => ({}))) as { productId?: string };
  const { data: product } = await admin
    .from('products')
    .select('id, price_xtr, active')
    .eq('id', productId ?? '')
    .maybeSingle();
  if (!product || !product.active || product.price_xtr <= 0)
    return json({ error: 'bad_product' }, 400);

  const { data: owned } = await admin
    .from('purchases')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('product_id', product.id)
    .eq('status', 'paid')
    .maybeSingle();
  if (owned) return json({ ok: true, already: true });

  const { error } = await admin.from('purchases').insert({
    user_id: auth.user.id,
    product_id: product.id,
    provider: 'dev',
    provider_charge_id: `dev-${crypto.randomUUID()}`,
    amount: product.price_xtr,
    currency: 'XTR',
  });
  if (error) return json({ error: 'insert_failed' }, 500);
  return json({ ok: true });
});
