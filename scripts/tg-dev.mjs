// pnpm tg:dev — Telegram Mini App на локальном стеке (подэтап E).
// Нужно: запущенный `pnpm supabase:start` и TELEGRAM_BOT_TOKEN в supabase/.env
// (бот тестового окружения Telegram; TELEGRAM_TEST_ENV=0 — бот боевого).
//  1. Генерирует TELEGRAM_WEBHOOK_SECRET в supabase/.env, если его нет.
//  2. Поднимает два туннеля cloudflared: к Supabase (54321) и к Vite.
//  3. Ставит вебхук бота на telegram-webhook и кнопку меню «Play» на туннель Vite.
//  4. Запускает Vite с VITE_SUPABASE_URL = туннель Supabase.
// Секреты Edge Functions стек берёт из supabase/.env при `supabase start` (config.toml →
// [edge_runtime.secrets]). Если функции их не видят — скрипт просит перезапустить стек.
// (`supabase functions serve` не используем: при выходе он удаляет контейнер функций стека.)
// Ctrl+C останавливает всё, что скрипт запустил.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = `${root}supabase/.env`;
const SUPABASE = 'http://127.0.0.1:54321';
const VITE_PORT = Number(process.env.TG_DEV_PORT ?? 5174);

function readEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

let env = readEnv();
if (!env.TELEGRAM_BOT_TOKEN)
  fail('В supabase/.env нет TELEGRAM_BOT_TOKEN=… (токен бота от @BotFather).');
if (!env.TELEGRAM_WEBHOOK_SECRET) {
  appendFileSync(envPath, `\nTELEGRAM_WEBHOOK_SECRET=${randomBytes(24).toString('hex')}\n`);
  env = readEnv();
  console.log('• TELEGRAM_WEBHOOK_SECRET сгенерирован в supabase/.env');
}
const token = env.TELEGRAM_BOT_TOKEN;
const test = (env.TELEGRAM_TEST_ENV ?? '1') === '1';

try {
  await fetch(`${SUPABASE}/auth/v1/health`, { signal: AbortSignal.timeout(3000) });
} catch {
  fail('Локальный Supabase не отвечает — сначала `pnpm supabase:start`.');
}
// Пустой update с верным секретом: 200 — функции видят токен и секрет, 503 — нет.
const probe = await fetch(`${SUPABASE}/functions/v1/telegram-webhook`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
  },
  body: '{}',
  signal: AbortSignal.timeout(60_000),
}).catch(() => null);
if (probe?.status !== 200)
  fail(
    `Edge Functions не видят секреты из supabase/.env (ответ ${probe?.status ?? 'нет'}).\n` +
      '  Перезапустите стек: pnpm supabase:stop && pnpm supabase:start',
  );

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // Дочерние процессы — лидеры своих групп: гасим группу целиком (pnpm → vite/cloudflared/docker).
  for (const c of children) if (c.exitCode === null) kill(c);
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    ...opts,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping && !child.retired) {
      console.error(`✖ ${name} завершился (код ${code}) — останавливаю всё.`);
      stop(1);
    }
  });
  return child;
}

function kill(child) {
  child.retired = true;
  try {
    process.kill(-child.pid, 'SIGINT');
  } catch {
    child.kill('SIGINT');
  }
}

/**
 * Одна попытка туннеля cloudflared: ждём адрес *.trycloudflare.com, регистрацию соединения
 * и DNS-запись. Быстрые туннели иногда так и не становятся доступны — тогда null.
 */
async function tunnelOnce(name, url) {
  const child = run(name, 'pnpm', [
    'exec',
    'cloudflared',
    'tunnel',
    '--no-autoupdate',
    '--url',
    url,
  ]);
  let log = '';
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 45_000);
    const onData = (buf) => {
      log += String(buf);
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(log);
      if (m && log.includes('Registered tunnel connection')) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
  if (ready && (await waitDns(new URL(ready).hostname, 40))) return ready;
  kill(child);
  return null;
}

async function tunnel(name, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const public_ = await tunnelOnce(name, url);
    if (public_) return public_;
    console.log(`• ${name}: туннель не поднялся, попытка ${attempt + 1}…`);
  }
  throw new Error(`${name}: cloudflared не дал рабочий туннель за 3 попытки`);
}

async function botApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}${test ? '/test' : ''}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * DNS-запись *.trycloudflare.com появляется через несколько секунд после выдачи адреса.
 * Спрашиваем публичный DNS, а не системный: ранний запрос через систему даёт NXDOMAIN,
 * который macOS кэширует, и туннель потом «не отвечает» ещё долго.
 */
async function waitDns(host, seconds) {
  const resolver = new Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  for (let i = 0; i < seconds; i++) {
    try {
      if ((await resolver.resolve4(host)).length > 0) return true;
    } catch {
      /* ещё нет записи */
    }
    await sleep(1000);
  }
  return false;
}

/** Ждём, пока по туннелю начнёт отвечать сервис. */
async function waitFor(url, ok = (r) => r.status < 500) {
  for (let i = 0; i < 60; i++) {
    try {
      if (ok(await fetch(url, { signal: AbortSignal.timeout(4000) }))) return;
    } catch {
      /* ещё не готов */
    }
    await sleep(1000);
  }
  throw new Error(`не отвечает: ${url}`);
}

try {
  const me = await botApi('getMe', {});
  console.log(`• Бот @${me.username} (${test ? 'тестовое' : 'боевое'} окружение Telegram)`);

  console.log('• Поднимаю туннели cloudflared…');
  const [supaUrl, appUrl] = await Promise.all([
    tunnel('tunnel-supabase', SUPABASE),
    tunnel('tunnel-vite', `http://localhost:${VITE_PORT}`),
  ]);

  const vite = run(
    'vite',
    'pnpm',
    [
      '--filter',
      '@chess-battler/client',
      'exec',
      'vite',
      '--port',
      String(VITE_PORT),
      '--strictPort',
    ],
    {
      env: { ...process.env, VITE_SUPABASE_URL: supaUrl },
    },
  );
  vite.stdout.on('data', (b) => process.stdout.write(`[vite] ${b}`));
  vite.stderr.on('data', (b) => process.stderr.write(`[vite] ${b}`));

  await waitFor(`${supaUrl}/auth/v1/health`);
  await waitFor(appUrl);

  await botApi('setWebhook', {
    url: `${supaUrl}/functions/v1/telegram-webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'pre_checkout_query'],
    drop_pending_updates: true,
  });
  await botApi('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Play', web_app: { url: appUrl } },
  });

  console.log(`
✔ Готово.
  Mini App:  ${appUrl}
  Supabase:  ${supaUrl}
  Откройте @${me.username} в Telegram${test ? ' (тестовый аккаунт)' : ''} → кнопка «Play» или /start.
  Ctrl+C — остановить туннели и Vite.
`);
} catch (e) {
  console.error(`✖ ${e instanceof Error ? e.message.replaceAll(token, '<token>') : e}`);
  stop(1);
}
