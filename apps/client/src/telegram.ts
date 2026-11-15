import type { ColorToken } from './theme/tokens';

/** Нужная нам часть Telegram WebApp SDK (https://core.telegram.org/bots/webapps). */
export interface TelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe: {
    readonly user?: { readonly id: number; readonly language_code?: string };
  };
  readonly version: string;
  readonly colorScheme: 'light' | 'dark';
  readonly themeParams: Readonly<Record<string, string | undefined>>;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  openInvoice(
    url: string,
    cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void,
  ): void;
  readonly BackButton: { show(): void; hide(): void; onClick(cb: () => void): void };
  readonly HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/** Открыто ли внутри Telegram: Telegram передаёт параметры запуска в адресе (tgWebApp…). */
export function launchedInTelegram(loc: Pick<Location, 'hash' | 'search'> = location): boolean {
  return /tgWebApp(Data|Version|Platform)/.test(loc.hash + loc.search);
}

/**
 * Загрузить SDK только внутри Telegram (обычным веб-игрокам скрипт telegram.org не нужен).
 * Вызывать до роутера: SDK читает параметры запуска из hash.
 */
export async function loadTelegram(): Promise<TelegramWebApp | null> {
  if (!launchedInTelegram()) return null;
  await new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.append(s);
  });
  const w = (globalThis as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

/** Тема Telegram → переопределения дизайн-токенов интерфейса (доска и фигуры не меняются). */
export function themeOverrides(
  theme: TelegramWebApp['themeParams'],
): Partial<Record<ColorToken, string>> {
  const map: [string, ColorToken][] = [
    ['bg_color', 'bg'],
    ['secondary_bg_color', 'surface'],
    ['section_bg_color', 'surfaceRaised'],
    ['text_color', 'text'],
    ['hint_color', 'textMuted'],
    ['button_color', 'accent'],
    ['button_text_color', 'textOnAccent'],
    ['destructive_text_color', 'danger'],
  ];
  const out: Partial<Record<ColorToken, string>> = {};
  for (const [param, token] of map) {
    const v = theme[param];
    if (v && /^#[0-9a-f]{6}$/i.test(v)) out[token] = v.toLowerCase();
  }
  return out;
}

/** Первичная настройка Mini App: развернуть, запретить свайп-закрытие (мешает перетаскиванию). */
export function setupTelegram(w: TelegramWebApp): void {
  w.ready();
  w.expand();
  if (w.isVersionAtLeast('7.7')) w.disableVerticalSwipes?.();
}
