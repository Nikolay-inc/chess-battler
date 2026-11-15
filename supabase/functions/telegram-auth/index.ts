// Вход по initData Telegram Mini App (подэтап E).
// 1. Проверяем подпись initData токеном бота и свежесть auth_date.
// 2. Находим пользователя Supabase, привязанного к Telegram id (таблица telegram_accounts).
//    Нет привязки и игрок сейчас гость на этом устройстве — превращаем ЭТОГО гостя
//    в аккаунт Telegram (прогресс сохраняется). Иначе — создаём нового пользователя.
// 3. Возвращаем одноразовый token_hash; клиент получает сессию через verifyOtp.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS, bearer, json } from '../_shared/http.ts';
import { telegramEmail, verifyInitData } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return json({ error: 'not_configured' }, 503);

  const { initData } = (await req.json().catch(() => ({}))) as { initData?: string };
  const check = await verifyInitData(initData ?? '', token);
  if (!check.ok) return json({ error: check.error }, 401);
  const tg = check.user;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const email = telegramEmail(tg.id);
  const meta = {
    telegram_id: tg.id,
    username: tg.username ?? null,
    first_name: tg.first_name ?? null,
  };

  const { data: link } = await admin
    .from('telegram_accounts')
    .select('user_id')
    .eq('telegram_id', tg.id)
    .maybeSingle();
  let userId = link?.user_id as string | undefined;

  if (!userId) {
    // Гость на этом устройстве → становится аккаунтом Telegram с тем же id.
    const caller = bearer(req) ? (await admin.auth.getUser(bearer(req))).data.user : null;
    if (caller?.is_anonymous) {
      const { error } = await admin.auth.admin.updateUserById(caller.id, {
        email,
        email_confirm: true,
        user_metadata: meta,
        app_metadata: { provider: 'telegram' },
      });
      if (error) return json({ error: 'link_failed' }, 500);
      userId = caller.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: meta,
        app_metadata: { provider: 'telegram' },
      });
      if (error || !data.user) return json({ error: 'create_failed' }, 500);
      userId = data.user.id;
    }
    const { error: mapError } = await admin
      .from('telegram_accounts')
      .insert({ telegram_id: tg.id, user_id: userId });
    if (mapError) return json({ error: 'map_failed' }, 500);
    // Ник по умолчанию — имя из Telegram (если игрок ещё не задал свой).
    if (tg.first_name) {
      await admin
        .from('profiles')
        .update({ nickname: tg.first_name.slice(0, 20) })
        .eq('id', userId)
        .is('nickname', null);
    }
  }

  // Одноразовая ссылка входа → клиенту нужен только token_hash.
  const { data: magic, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !magic.properties?.hashed_token) return json({ error: 'session_failed' }, 500);
  return json({ token_hash: magic.properties.hashed_token, user_id: userId });
});
