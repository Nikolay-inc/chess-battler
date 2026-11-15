// Счёт Telegram Stars (XTR) на скин (подэтап E). Цена — с сервера (products), не от клиента.
// Покупку записывает telegram-webhook после successful_payment.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS, bearer, json } from '../_shared/http.ts';
import { botApi, encodePayload } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return json({ error: 'not_configured' }, 503);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: auth } = await admin.auth.getUser(bearer(req));
  if (!auth.user) return json({ error: 'unauthorized' }, 401);

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
  if (owned) return json({ error: 'already_owned' }, 409);

  let link: string;
  try {
    link = await botApi<string>(
      'createInvoiceLink',
      {
        title: `Chess Battler: ${product.id}`,
        description: 'Cosmetic skin — does not affect battles',
        payload: encodePayload({ u: auth.user.id, p: product.id }),
        provider_token: '', // Stars: пусто
        currency: 'XTR',
        prices: [{ label: product.id, amount: product.price_xtr }],
      },
      { token, test: Deno.env.get('TELEGRAM_TEST_ENV') === '1' },
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message.replace(token, '<token>') : e);
    return json({ error: 'bot_api_failed' }, 502);
  }
  return json({ link });
});
