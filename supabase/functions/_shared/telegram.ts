// Общий код Telegram для Edge Functions: проверка initData Mini App и вызовы Bot API.
// Только Web Crypto и fetch — работает и в Deno (Edge Functions), и в Node (тесты Vitest).

export interface TelegramUser {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
}

export type InitDataResult =
  | { readonly ok: true; readonly user: TelegramUser; readonly authDate: number }
  | { readonly ok: false; readonly error: 'no_hash' | 'bad_signature' | 'expired' | 'no_user' };

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Сравнение без утечки по времени. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Строка для подписи: все поля, кроме hash, отсортированы, «key=value» через \n. */
export function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/** Подпись initData токеном бота (так подписывает Telegram). */
export async function signInitData(params: URLSearchParams, botToken: string): Promise<string> {
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  return hex(await hmac(secret, dataCheckString(params)));
}

/**
 * Проверка initData Mini App: подпись (HMAC-SHA256, ключ — HMAC("WebAppData", токен))
 * и свежесть auth_date (по умолчанию не старше суток).
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  { maxAgeSec = 86_400, now = Math.floor(Date.now() / 1000) } = {},
): Promise<InitDataResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'no_hash' };
  const expected = await signInitData(params, botToken);
  if (!safeEqual(expected, hash.toLowerCase())) return { ok: false, error: 'bad_signature' };
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || now - authDate > maxAgeSec) return { ok: false, error: 'expired' };
  let user: TelegramUser | null = null;
  try {
    user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
  } catch {
    user = null;
  }
  if (!user || typeof user.id !== 'number') return { ok: false, error: 'no_user' };
  return { ok: true, user, authDate };
}

/** Технический email пользователя Telegram в Supabase Auth (не почтовый ящик). */
export const telegramEmail = (telegramId: number): string => `tg-${telegramId}@telegram.invalid`;

/**
 * Вызов Bot API. Тестовое окружение Telegram — путь /bot<token>/test/<method>.
 */
export async function botApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
  { token, test, fetchFn = fetch }: { token: string; test: boolean; fetchFn?: typeof fetch },
): Promise<T> {
  const url = `https://api.telegram.org/bot${token}${test ? '/test' : ''}/${method}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Bot API ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

/** Полезная нагрузка счёта Stars (≤128 байт): кто и что покупает. */
export interface InvoicePayload {
  readonly u: string;
  readonly p: string;
}
export const encodePayload = (p: InvoicePayload): string => JSON.stringify(p);
export function decodePayload(raw: string): InvoicePayload | null {
  try {
    const p = JSON.parse(raw) as InvoicePayload;
    return typeof p.u === 'string' && typeof p.p === 'string' ? p : null;
  } catch {
    return null;
  }
}
