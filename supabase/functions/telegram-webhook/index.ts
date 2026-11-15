// Вебхук бота (подэтап E). Telegram подписывает запросы секретом из setWebhook
// (заголовок X-Telegram-Bot-Api-Secret-Token) — без него запрос отклоняется.
// - pre_checkout_query: проверяем товар, цену и валюту → answerPreCheckoutQuery.
// - successful_payment: записываем покупку (повтор отсекает unique по charge id).
// - /start: кнопка открытия Mini App.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { botApi, decodePayload } from '../_shared/telegram.ts';

interface Update {
  pre_checkout_query?: {
    id: string;
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  message?: {
    chat: { id: number };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
    };
  };
}

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!token || !secret) return json({ error: 'not_configured' }, 503);
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret)
    return json({ error: 'forbidden' }, 403);

  const opts = { token, test: Deno.env.get('TELEGRAM_TEST_ENV') === '1' };
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const update = (await req.json().catch(() => ({}))) as Update;

  const productOk = async (payload: string, currency: string, amount: number) => {
    const p = decodePayload(payload);
    if (!p || currency !== 'XTR') return null;
    const { data } = await admin
      .from('products')
      .select('id, price_xtr, active')
      .eq('id', p.p)
      .maybeSingle();
    return data && data.active && data.price_xtr === amount ? p : null;
  };

  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const ok = !!(await productOk(q.invoice_payload, q.currency, q.total_amount));
    await botApi(
      'answerPreCheckoutQuery',
      ok
        ? { pre_checkout_query_id: q.id, ok: true }
        : { pre_checkout_query_id: q.id, ok: false, error_message: 'Item unavailable' },
      opts,
    );
    return json({ ok: true });
  }

  const paid = update.message?.successful_payment;
  if (paid) {
    const p = await productOk(paid.invoice_payload, paid.currency, paid.total_amount);
    if (p) {
      // Повтор того же платежа упрётся в unique (provider, provider_charge_id) — это нормально.
      await admin.from('purchases').insert({
        user_id: p.u,
        product_id: p.p,
        provider: 'telegram_stars',
        provider_charge_id: paid.telegram_payment_charge_id,
        amount: paid.total_amount,
        currency: 'XTR',
      });
    }
    return json({ ok: true });
  }

  const text = update.message?.text ?? '';
  if (text.startsWith('/start') && update.message) {
    // Адрес Mini App — MINIAPP_URL или кнопка меню бота (её ставит pnpm tg:dev на туннель).
    const appUrl =
      Deno.env.get('MINIAPP_URL') ??
      (await botApi<{ web_app?: { url: string } }>('getChatMenuButton', {}, opts).catch(() => null))
        ?.web_app?.url;
    if (!appUrl) return json({ ok: true });
    await botApi(
      'sendMessage',
      {
        chat_id: update.message.chat.id,
        text: 'Chess Battler ♞',
        reply_markup: { inline_keyboard: [[{ text: '▶ Play', web_app: { url: appUrl } }]] },
      },
      opts,
    );
  }
  return json({ ok: true });
});
